import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clamp01, fadeOut, lerp, ramp } from "../lib/anim";

/**
 * The narrator. If `public/avatar/avatar.glb` exists (an Avaturn export: Mixamo-compatible rig plus
 * ARKit face blendshapes, git-ignored), it is loaded and driven: the jaw follows the narration's
 * loudness, the eyes blink, the head and spine drift, the arms gesture. Without it, a stylised
 * character built from three.js primitives stands in with the same motion. The mouth opens with the narration's loudness
 * envelope, the eyes blink, the head nods and turns, the chest breathes, and the hands come up
 * and gesture while she talks. It sits over every scene: large beside the "who I am" text and
 * small in a corner while the prototype is on screen.
 */
export type AvatarMode = "big" | "small" | "none";
export type AvatarCue = { from: number; frames: number; mode: AvatarMode; envelope: number[]; voDelay: number };

const CAM_Z = 3.2;
const FOV = 40;
const PX_PER_UNIT = 1080 / 2 / (CAM_Z * Math.tan(((FOV / 2) * Math.PI) / 180));
const toWorld = (px: number, py: number): [number, number] => [(px - 960) / PX_PER_UNIT, (540 - py) / PX_PER_UNIT];
const HEAD_Y = 0.62; // head centre above the figure's origin (base of the neck)
/** Where the centre of the head sits on screen (pixels), the figure's scale, and which way she faces. */
const LAYOUT: Record<Exclude<AvatarMode, "none">, { x: number; y: number; scale: number; yaw: number; gesture: number; fadeH: number }> = {
  big: { x: 440, y: 400, scale: 1.0, yaw: 0.16, gesture: 1, fadeH: 220 },
  small: { x: 205, y: 870, scale: 0.44, yaw: 0.05, gesture: 0.25, fadeH: 130 },
};

const easeOutBack = (x: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/**
 * Per-frame mouth opening and "is she talking" level for the whole film, smoothed continuously
 * across scene cuts so the hands and mouth never snap. `open` follows syllables (fast attack,
 * medium release); `talk` is slow, so the hands rise at the start of a sentence and settle in pauses.
 */
function speechSeries(cues: AvatarCue[]): { open: number[]; talk: number[] } {
  const open: number[] = [], talk: number[] = [];
  let a = 0, b = 0;
  for (const c of cues) {
    for (let f = 0; f < c.frames; f++) {
      const i = f - c.voDelay;
      const e = i >= 0 ? (c.envelope[i] ?? 0) : 0;
      const cur = clamp01(e * 5.5);
      a += (cur - a) * (cur > a ? 0.7 : 0.45);
      const on = e > 0.02 ? 1 : 0;
      b += (on - b) * (on > b ? 0.12 : 0.035);
      open[c.from + f] = Math.pow(a, 0.85);
      talk[c.from + f] = b;
    }
  }
  return { open, talk };
}

function blinkAmount(T: number): number {
  const period = 3.1;
  const i = Math.floor((T - 0.9) / period);
  let out = 0;
  for (const k of [i, i + 1]) {
    const t0 = 0.9 + k * period + 0.6 * Math.sin(k * 2.7);
    const dt = T - t0;
    const a = dt < 0 ? 0 : dt < 0.08 ? dt / 0.08 : dt < 0.13 ? 1 : dt < 0.26 ? 1 - (dt - 0.13) / 0.13 : 0;
    out = Math.max(out, a);
  }
  return out;
}

const tri = (pts: Array<[number, number]>) => {
  const s = new THREE.Shape();
  s.moveTo(pts[0]![0], pts[0]![1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  s.closePath();
  return new THREE.ShapeGeometry(s);
};

function useParts() {
  return useMemo(() => {
    const std = (color: string, roughness = 0.75, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
    const mat = {
      skin: std("#d6a07f", 0.72),
      hair: std("#1d1512", 0.5, { side: THREE.DoubleSide }),
      blazer: std("#3a4150", 0.85),
      lapel: std("#4a5264", 0.8),
      shirt: std("#f3f5f8", 0.6),
      white: std("#f8f8f8", 0.25),
      iris: std("#4b2d1b", 0.4),
      pupil: std("#0b0a0a", 0.3),
      gleam: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.2, roughness: 0.2 }),
      lips: std("#b4675d", 0.6, { transparent: true }),
      smile: std("#b4675d", 0.6, { transparent: true }),
      cavity: std("#3d1818", 0.9),
      brow: std("#1d1512", 0.6),
      gold: std("#dcb864", 0.3, { metalness: 0.85 }),
    };
    const geo = {
      head: new THREE.SphereGeometry(0.42, 64, 48),
      eye: new THREE.SphereGeometry(0.075, 32, 24),
      iris: new THREE.SphereGeometry(0.046, 32, 24),
      pupil: new THREE.SphereGeometry(0.022, 16, 12),
      gleam: new THREE.SphereGeometry(0.012, 8, 8),
      nose: new THREE.SphereGeometry(0.05, 24, 18),
      ear: new THREE.SphereGeometry(0.07, 24, 18),
      earring: new THREE.SphereGeometry(0.026, 16, 12),
      brow: new THREE.TorusGeometry(0.085, 0.011, 8, 24, Math.PI * 0.55),
      lip: new THREE.TorusGeometry(0.1, 0.014, 10, 32, Math.PI * 0.7),
      cavity: new THREE.SphereGeometry(0.07, 32, 24),
      lowerLip: new THREE.CapsuleGeometry(0.014, 0.12, 6, 12),
      neck: new THREE.CylinderGeometry(0.12, 0.14, 0.36, 32),
      torso: new RoundedBoxGeometry(1.15, 1.1, 0.5, 6, 0.16),
      shoulder: new THREE.SphereGeometry(0.17, 32, 24),
      upperArm: new THREE.CapsuleGeometry(0.1, 0.42, 8, 16),
      foreArm: new THREE.CapsuleGeometry(0.09, 0.38, 8, 16),
      hand: new THREE.SphereGeometry(0.11, 24, 18),
      hairCap: new THREE.SphereGeometry(0.455, 64, 48, 0, Math.PI * 2, 0, Math.PI * 0.38),
      hairFall: new THREE.LatheGeometry(
        [[0.3, 0.4], [0.38, 0.26], [0.47, 0.0], [0.5, -0.3], [0.56, -0.55], [0.64, -0.78], [0.64, -1.0], [0.62, -1.24]].map(([r, y]) => new THREE.Vector2(r, y)),
        64,
        1.0,
        Math.PI * 2 - 2.0,
      ),
      upperLip: new THREE.CapsuleGeometry(0.012, 0.12, 6, 12),
      shirt: tri([[-0.17, 0], [0.17, 0], [0, -0.5]]),
      lapelL: tri([[-0.31, 0.02], [-0.16, 0], [0, -0.52], [-0.05, -0.58]]),
      lapelR: tri([[0.31, 0.02], [0.16, 0], [0, -0.52], [0.05, -0.58]]),
    };
    return { mat, geo };
  }, []);
}

type Pose = { open: number; blink: number; talk: number; T: number; yaw: number; gesture: number };

const Arm: React.FC<{ side: 1 | -1; talk: number; T: number; parts: ReturnType<typeof useParts> }> = ({ side, talk, T, parts }) => {
  const { geo, mat } = parts;
  const right = side === 1;
  // rest pose hangs by the side; while talking the right hand comes up in front of the chest and moves
  const restUpper: [number, number, number] = [0.12, 0, 0.18 * side];
  const talkUpper: [number, number, number] = right ? [0.95 + 0.1 * Math.sin(T * 4.1 + 1), 0.15, 0.2 + 0.08 * Math.sin(T * 2.9)] : [0.5 + 0.06 * Math.sin(T * 3.3), -0.1, -0.3 + 0.05 * Math.sin(T * 2.2)];
  const restElbow = 0.25;
  const talkElbow = right ? 1.2 + 0.18 * Math.sin(T * 5.3) : 0.85 + 0.1 * Math.sin(T * 3.7 + 2);
  const k = right ? talk : talk * 0.8;
  const upper: [number, number, number] = [lerp(restUpper[0], talkUpper[0], k), lerp(restUpper[1], talkUpper[1], k), lerp(restUpper[2], talkUpper[2], k)];
  const elbow = lerp(restElbow, talkElbow, k);
  return (
    <group position={[0.58 * side, -0.12, 0]} rotation={upper}>
      <mesh geometry={geo.upperArm} material={mat.blazer} position={[0, -0.31, 0]} />
      <group position={[0, -0.6, 0]} rotation={[elbow, 0, 0]}>
        <mesh geometry={geo.foreArm} material={mat.blazer} position={[0, -0.28, 0]} />
        <mesh geometry={geo.hand} material={mat.skin} position={[0, -0.63, 0]} scale={[1, 1.15, 0.7]} />
      </group>
    </group>
  );
};

const Figure: React.FC<Pose> = ({ open, blink, talk, T, yaw, gesture }) => {
  const parts = useParts();
  const { geo, mat } = parts;
  const headPitch = 0.05 * Math.sin(T * 0.33 + 1.2) + open * 0.03;
  const headYaw = 0.09 * Math.sin(T * 0.47) + 0.025 * Math.sin(T * 1.31);
  const headRoll = 0.02 * Math.sin(T * 0.21 + 0.5);
  const raise = 0.5 * talk + 0.5 * open;
  const mouth = 0.12 + open * 0.85;
  const gaze: [number, number] = [0.012 * Math.sin(T * 0.7), 0.006 * Math.sin(T * 0.9)];
  const breathe = 1 + 0.012 * Math.sin(T * 1.3);
  const eyeY = 1 - 0.92 * blink;
  mat.smile.opacity = clamp01(1 - open * 1.6);
  mat.lips.opacity = clamp01(open * 2.5);
  return (
    <group rotation={[0, yaw + 0.05 * Math.sin(T * 0.41), 0.015 * Math.sin(T * 0.5)]}>
      {/* body */}
      <mesh geometry={geo.neck} material={mat.skin} position={[0, 0.1, 0]} />
      <group scale={[1, breathe, 1]}>
        <mesh geometry={geo.torso} material={mat.blazer} position={[0, -0.6, 0]} />
        <mesh geometry={geo.shoulder} material={mat.blazer} position={[-0.52, -0.1, 0]} />
        <mesh geometry={geo.shoulder} material={mat.blazer} position={[0.52, -0.1, 0]} />
        <mesh geometry={geo.shirt} material={mat.shirt} position={[0, -0.06, 0.252]} />
        <mesh geometry={geo.lapelL} material={mat.lapel} position={[0, -0.06, 0.256]} />
        <mesh geometry={geo.lapelR} material={mat.lapel} position={[0, -0.06, 0.256]} />
      </group>
      <Arm side={1} talk={talk * gesture} T={T} parts={parts} />
      <Arm side={-1} talk={talk * gesture} T={T} parts={parts} />
      {/* head */}
      <group position={[0, HEAD_Y, 0]} rotation={[headPitch, headYaw, headRoll]}>
        <mesh geometry={geo.head} material={mat.skin} scale={[1, 1.1, 0.95]} />
        <mesh geometry={geo.ear} material={mat.skin} position={[-0.4, -0.02, 0]} />
        <mesh geometry={geo.ear} material={mat.skin} position={[0.4, -0.02, 0]} />
        <mesh geometry={geo.earring} material={mat.gold} position={[-0.4, -0.1, 0.04]} />
        <mesh geometry={geo.earring} material={mat.gold} position={[0.4, -0.1, 0.04]} />
        <mesh geometry={geo.nose} material={mat.skin} position={[0, -0.045, 0.4]} scale={[0.75, 1.0, 0.6]} />
        {[-1, 1].map((s) => (
          <group key={s} position={[0.15 * s, 0.06, 0.33]} scale={[1, eyeY, 1]}>
            <mesh geometry={geo.eye} material={mat.white} />
            <mesh geometry={geo.iris} material={mat.iris} position={[gaze[0], gaze[1], 0.045]} />
            <mesh geometry={geo.pupil} material={mat.pupil} position={[gaze[0] * 1.2, gaze[1] * 1.2, 0.07]} />
            <mesh geometry={geo.gleam} material={mat.gleam} position={[0.02 + gaze[0], 0.022 + gaze[1], 0.086]} />
          </group>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={geo.brow} material={mat.brow} position={[0.15 * s, 0.115 + raise * 0.025, 0.37]} rotation={[0.1, 0.3 * s, Math.PI * 0.225 + 0.06 * s]} />
        ))}
        <mesh geometry={geo.lip} material={mat.smile} position={[0, -0.08, 0.37]} rotation={[0, 0, Math.PI * 1.15]} />
        <mesh geometry={geo.upperLip} material={mat.lips} position={[0, -0.178, 0.365]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1 + 0.3 * open, 1]} />
        <mesh geometry={geo.cavity} material={mat.cavity} position={[0, -0.18 - 0.07 * mouth, 0.33]} scale={[1.6 + 0.4 * open, mouth, 0.6]} />
        <mesh geometry={geo.lowerLip} material={mat.lips} position={[0, -0.18 - 0.14 * mouth - 0.012, 0.365]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1 + 0.4 * open, 1]} />
        {/* hair: cap, back and sides, and four long locks over the shoulders */}
        <group position={[0, 0.07, -0.03]} scale={[1.02, 1.08, 1]}>
          <mesh geometry={geo.hairCap} material={mat.hair} />
        </group>
        <mesh geometry={geo.hairFall} material={mat.hair} position={[0, 0, -0.04]} />
      </group>
    </group>
  );
};

const GLB_URL = "avatar/avatar.glb";

/** How the exported rig maps onto the motion. Tune after `python3 scripts/inspect_glb.py public/avatar/avatar.glb`. */
const RIG = {
  /** model units (metres) → scene units, per layout */
  scale: { big: 3.0, small: 1.3 },
  bones: { head: /head$/i, neck: /neck$/i, spine: /spine1$/i, rightArm: /right(_?)arm$/i, rightForeArm: /right(_?)forearm$/i, leftArm: /left(_?)arm$/i, leftForeArm: /left(_?)forearm$/i },
  /** XYZ rotations (radians) added to the bind pose: arms down from the A/T pose at rest, then the gesture */
  arm: { right: { rest: [0, 0, -1.0], talk: [-0.9, 0, -0.5] }, left: { rest: [0, 0, 1.0], talk: [-0.3, 0, 0.9] } },
  foreArm: { right: { rest: [0, 0, 0], talk: [-1.3, 0.5, 0] }, left: { rest: [0, 0, 0], talk: [-0.6, -0.3, 0] } },
  morphs: { open: ["jawOpen", "mouthOpen", "viseme_aa"], blink: ["eyeBlinkLeft", "eyeBlinkRight", "eyesClosed"], smile: ["mouthSmileLeft", "mouthSmileRight", "mouthSmile"], brows: ["browInnerUp"] },
  restSmile: 0.25,
  openGain: 0.8,
};

function useGlb(url: string): GLTF | "missing" | null {
  const [gltf, setGltf] = useState<GLTF | "missing" | null>(null);
  useEffect(() => {
    const handle = delayRender("avatar glb", { timeoutInMilliseconds: 120000 });
    new GLTFLoader().load(
      url,
      (g) => {
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.frustumCulled = false;
        });
        setGltf(g);
        continueRender(handle);
      },
      undefined,
      () => {
        setGltf("missing");
        continueRender(handle);
      },
    );
  }, [url]);
  return gltf;
}

const euler = (r: number[]) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] ?? 0, r[1] ?? 0, r[2] ?? 0));
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => lerp(v, b[i] ?? 0, k));

/** The exported avatar, placed with its head at the group origin and driven bone by bone. */
const GlbFigure: React.FC<Pose & { gltf: GLTF }> = ({ gltf, open, blink, talk, T, yaw, gesture }) => {
  const rig = useMemo(() => {
    const scene = gltf.scene;
    const find = (re: RegExp) => {
      let hit: THREE.Object3D | null = null;
      scene.traverse((o) => {
        if (!hit && re.test(o.name)) hit = o;
      });
      return hit as THREE.Object3D | null;
    };
    const bones = Object.fromEntries(Object.entries(RIG.bones).map(([k, re]) => [k, find(re)])) as Record<keyof typeof RIG.bones, THREE.Object3D | null>;
    const rest = new Map<THREE.Object3D, THREE.Quaternion>();
    for (const b of Object.values(bones)) if (b) rest.set(b, b.quaternion.clone());
    const morphs: Array<{ mesh: THREE.Mesh; dict: Record<string, number> }> = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.morphTargetDictionary && m.morphTargetInfluences) morphs.push({ mesh: m, dict: m.morphTargetDictionary });
    });
    scene.updateMatrixWorld(true);
    const headPos = new THREE.Vector3();
    (bones.head ?? scene).getWorldPosition(headPos);
    return { scene, bones, rest, morphs, headPos };
  }, [gltf]);
  const headPitch = 0.05 * Math.sin(T * 0.33 + 1.2) + open * 0.03;
  const headYaw = 0.09 * Math.sin(T * 0.47) + 0.025 * Math.sin(T * 1.31);
  const headRoll = 0.02 * Math.sin(T * 0.21 + 0.5);
  const raise = 0.5 * talk + 0.5 * open;
  useLayoutEffect(() => {
    const set = (names: string[], v: number) => {
      for (const { mesh, dict } of rig.morphs) for (const n of names) {
        const i = dict[n];
        if (i !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[i] = v;
      }
    };
    set(RIG.morphs.open, clamp01(open * RIG.openGain));
    set(RIG.morphs.blink, blink);
    set(RIG.morphs.smile, RIG.restSmile * (1 - open));
    set(RIG.morphs.brows, raise * 0.5);
    const rot = (bone: THREE.Object3D | null, r: number[]) => {
      if (!bone) return;
      bone.quaternion.copy(rig.rest.get(bone)!).multiply(euler(r));
    };
    rot(rig.bones.head, [headPitch, headYaw, headRoll]);
    rot(rig.bones.neck, [headPitch * 0.4, headYaw * 0.4, 0]);
    rot(rig.bones.spine, [0.01 * Math.sin(T * 1.3), 0.03 * Math.sin(T * 0.41), 0.012 * Math.sin(T * 0.5)]);
    const kr = talk * gesture, kl = talk * gesture * 0.8;
    const wob = (f: number, ph = 0) => Math.sin(T * f + ph);
    rot(rig.bones.rightArm, mix(RIG.arm.right.rest, RIG.arm.right.talk, kr).map((v, i) => v + (i === 0 ? 0.08 * wob(4.1, 1) : i === 2 ? 0.06 * wob(2.9) : 0) * kr));
    rot(rig.bones.rightForeArm, mix(RIG.foreArm.right.rest, RIG.foreArm.right.talk, kr).map((v, i) => v + (i === 0 ? 0.15 * wob(5.3) : 0) * kr));
    rot(rig.bones.leftArm, mix(RIG.arm.left.rest, RIG.arm.left.talk, kl).map((v, i) => v + (i === 0 ? 0.05 * wob(3.3) : 0) * kl));
    rot(rig.bones.leftForeArm, mix(RIG.foreArm.left.rest, RIG.foreArm.left.talk, kl).map((v, i) => v + (i === 0 ? 0.08 * wob(3.7, 2) : 0) * kl));
  }, [rig, open, blink, talk, T, gesture, headPitch, headYaw, headRoll, raise]);
  return (
    <group rotation={[0, yaw + 0.05 * Math.sin(T * 0.41), 0]}>
      <primitive object={rig.scene} position={[-rig.headPos.x, -rig.headPos.y, -rig.headPos.z]} />
    </group>
  );
};

const Floor: React.FC<{ show: number }> = ({ show }) => {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(14, 40, 0x2a3442, 0x1a2230);
    (g.material as THREE.Material).transparent = true;
    return g;
  }, []);
  (grid.material as THREE.Material).opacity = 0.3 * show;
  return <primitive object={grid} position={[0, -1.3, -1]} />;
};

export const AvatarOverlay: React.FC<{ cues: AvatarCue[] }> = ({ cues }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const series = useMemo(() => speechSeries(cues), [cues]);
  const glb = useGlb(staticFile(GLB_URL));
  const real = glb !== null && glb !== "missing";
  const T = frame / fps;
  const idx = cues.findIndex((c) => frame >= c.from && frame < c.from + c.frames);
  const cue = cues[idx];
  const prev = idx > 0 ? cues[idx - 1] : undefined;
  const local = cue ? (frame - cue.from) / fps : 0;
  const mode = cue?.mode ?? "none";
  const prevMode = prev?.mode ?? mode;
  const blend = ramp(local, 0, 0.6, "inout");
  const lay = (m: AvatarMode) => (m === "none" ? LAYOUT.big : LAYOUT[m]);
  const from = lay(prevMode === "none" ? mode : prevMode);
  const to = lay(mode === "none" ? prevMode : mode);
  const x = lerp(from.x, to.x, blend), y = lerp(from.y, to.y, blend), scale = lerp(from.scale, to.scale, blend), yaw = lerp(from.yaw, to.yaw, blend), gesture = lerp(from.gesture, to.gesture, blend);
  const fadeH = lerp(from.fadeH, to.fadeH, blend);
  let presence = easeOutBack(ramp(T, 0.15, 0.8, "linear"));
  if (mode === "none") presence *= prevMode === "none" ? 0 : 1 - ramp(local, 0, 0.4, "inout");
  else if (prevMode === "none") presence *= easeOutBack(ramp(local, 0, 0.6, "linear"));
  presence *= fadeOut(T, durationInFrames / fps, 0.3);
  const open = series.open[frame] ?? 0;
  const talk = series.talk[frame] ?? 0;
  const blink = blinkAmount(T);
  // the exported avatar is anchored at its head; the primitive figure at the base of its neck
  const glbScale = lerp(RIG.scale[prevMode === "none" ? (mode === "none" ? "big" : mode) : prevMode], RIG.scale[mode === "none" ? (prevMode === "none" ? "big" : prevMode) : mode], blend);
  const s = Math.max(0.0001, (real ? glbScale : scale) * presence);
  const [wx, wy] = toWorld(x, real ? y : y + HEAD_Y * s * PX_PER_UNIT);
  const floorShow = Math.min(1, presence) * (mode === "big" ? 1 : prevMode === "big" ? 1 - blend : 0);
  if (!cue || presence <= 0 || glb === null) return null;
  // the bottom of the figure dissolves into the frame edge through a mask, so nothing is painted over the scene
  const mask = `linear-gradient(to bottom, black ${height - fadeH}px, rgba(0,0,0,0.1) ${height - fadeH * 0.45}px, transparent ${height - fadeH * 0.22}px)`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <ThreeCanvas width={width} height={height} camera={{ fov: FOV, position: [0, 0, CAM_Z] }} style={{ position: "absolute", inset: 0, WebkitMaskImage: mask, maskImage: mask }} gl={{ antialias: true, alpha: true }} flat>
        <hemisphereLight args={["#dfe6ef", "#2a2f3a", 0.75]} />
        <directionalLight position={[2, 3, 4]} intensity={1.35} color="#fff1e0" />
        <directionalLight position={[-3, 2, -2]} intensity={0.9} color="#4f9ee8" />
        <directionalLight position={[-2, 0, 3]} intensity={0.35} />
        <Floor show={floorShow} />
        <group position={[wx, wy, 0]} scale={[s, s, s]}>
          {real ? <GlbFigure gltf={glb} open={open} blink={blink} talk={talk} T={T} yaw={yaw} gesture={gesture} /> : <Figure open={open} blink={blink} talk={talk} T={T} yaw={yaw} gesture={gesture} />}
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
