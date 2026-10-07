import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import faceJson from "../data/face.json";
import { clamp01, lerp, ramp } from "../lib/anim";

/**
 * The speaking avatar: the headshot with its background removed, laid over a depth relief built from
 * Apple Vision face landmarks (scripts/face.py), lit in three.js. The jaw drops with the narration's
 * loudness envelope, the eyes blink, the head drifts. It sits over every scene of the composition,
 * large beside the "who I am" text and small in a corner while the prototype is on screen.
 */
type FaceData = { n: number; z: number[]; jaw: number[]; inner: number[]; blink: number[]; blinkTarget: number[]; anchors: { faceCenter: [number, number]; mouthHeight: number } };
const FACE = faceJson as unknown as FaceData;

export type AvatarMode = "big" | "small" | "none";
export type AvatarCue = { from: number; frames: number; mode: AvatarMode; envelope: number[]; voDelay: number };

const CAM_Z = 3.2;
const FOV = 40;
const PX_PER_UNIT = 1080 / 2 / (CAM_Z * Math.tan(((FOV / 2) * Math.PI) / 180));
const toWorld = (px: number, py: number): [number, number] => [(px - 960) / PX_PER_UNIT, (540 - py) / PX_PER_UNIT];
/** Where the centre of the face sits on screen (pixels) and how large the head is (plane units per photo). */
const LAYOUT: Record<Exclude<AvatarMode, "none">, { x: number; y: number; scale: number; fadeW: number; fadeH: number }> = {
  big: { x: 430, y: 470, scale: 1.9, fadeW: 900, fadeH: 260 },
  small: { x: 200, y: 880, scale: 0.66, fadeW: 430, fadeH: 150 },
};
const MAX_OPEN = 0.038; // jaw drop at full loudness, in photo units (the closed mouth is ~0.057 tall)

const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

function useTexture(url: string): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    const handle = delayRender("avatar texture");
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        setTex(t);
        continueRender(handle);
      },
      undefined,
      () => continueRender(handle),
    );
  }, [url]);
  return tex;
}

/** Loudness → mouth opening, smoothed so syllables read as motion rather than flicker. */
function speechOpen(cue: AvatarCue | undefined, frame: number): number {
  if (!cue) return 0;
  const local = frame - cue.from - cue.voDelay;
  if (local < 0) return 0;
  let a = 0;
  for (let i = 0; i <= local; i++) {
    const cur = clamp01((cue.envelope[i] ?? 0) * 5.5);
    a += (cur - a) * (cur > a ? 0.7 : 0.45);
  }
  return Math.pow(a, 0.85);
}

function blinkAmount(T: number): number {
  const period = 3.1;
  const i = Math.floor((T - 0.9) / period);
  let out = 0;
  for (const k of [i - 1, i]) {
    const t0 = 0.9 + k * period + 0.6 * Math.sin(k * 2.7);
    const dt = T - t0;
    const a = dt < 0 ? 0 : dt < 0.08 ? dt / 0.08 : dt < 0.13 ? 1 : dt < 0.26 ? 1 - (dt - 0.13) / 0.13 : 0;
    out = Math.max(out, a);
  }
  return out;
}

const Head: React.FC<{ open: number; blink: number; assemble: number; opacity: number; texture: THREE.Texture }> = ({ open, blink, assemble, opacity, texture }) => {
  const N = FACE.n;
  const W = N + 1;
  const count = W * W;
  const fc = FACE.anchors.faceCenter;
  const base = useMemo(() => {
    const x0 = new Float32Array(count), y0 = new Float32Array(count), z0 = new Float32Array(count), v = new Float32Array(count);
    const uv = new Float32Array(count * 2);
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        const u = i / N, vv = j / N;
        x0[k] = u - 0.5;
        y0[k] = 0.5 - vv;
        z0[k] = FACE.z[k] ?? 0;
        v[k] = vv;
        uv[k * 2] = u;
        uv[k * 2 + 1] = 1 - vv;
      }
    }
    const index: number[] = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
    return { x0, y0, z0, v, uv, index };
  }, [N, W, count]);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      pos[k * 3] = base.x0[k]!;
      pos[k * 3 + 1] = base.y0[k]!;
      pos[k * 3 + 2] = base.z0[k]!;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(base.uv, 2));
    g.setIndex(base.index);
    g.computeVertexNormals();
    return g;
  }, [base, count]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, transparent: true, alphaTest: 0.04, roughness: 1, metalness: 0 }), [texture]);
  useLayoutEffect(() => {
    const pos = geom.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const col = geom.getAttribute("color") as THREE.BufferAttribute;
    const carr = col.array as Float32Array;
    const drop = open * MAX_OPEN;
    for (let k = 0; k < count; k++) {
      let x = base.x0[k]!, y = base.y0[k]!, z = base.z0[k]!;
      const j = FACE.jaw[k] ?? 0;
      if (j > 0) {
        y -= drop * j;
        z -= drop * 0.4 * j;
      }
      const b = FACE.blink[k] ?? 0;
      if (b > 0 && blink > 0) y = lerp(y, 0.5 - (FACE.blinkTarget[k] ?? 0), blink * b);
      if (assemble < 1) {
        // the portrait starts flat and far back, then inflates into its relief, top row first
        const a = easeOut((assemble - base.v[k]! * 0.25) / 0.75);
        z = lerp(-0.9, z, a);
      }
      arr[k * 3] = x;
      arr[k * 3 + 1] = y;
      arr[k * 3 + 2] = z;
      const dark = 1 - open * (FACE.inner[k] ?? 0) * 0.9;
      carr[k * 3] = dark;
      carr[k * 3 + 1] = dark;
      carr[k * 3 + 2] = dark;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    mat.opacity = opacity;
  }, [open, blink, assemble, opacity, geom, mat, base, count]);
  return <mesh geometry={geom} material={mat} position={[0.5 - fc[0], fc[1] - 0.5, 0]} />;
};

const Floor: React.FC<{ show: number }> = ({ show }) => {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(14, 40, 0x2a3442, 0x1a2230);
    (g.material as THREE.Material).transparent = true;
    return g;
  }, []);
  useLayoutEffect(() => {
    (grid.material as THREE.Material).opacity = 0.3 * show;
  }, [grid, show]);
  return <primitive object={grid} position={[0, -1.3, -1]} />;
};

export const AvatarOverlay: React.FC<{ cues: AvatarCue[] }> = ({ cues }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const texture = useTexture(staticFile("photo/cutout.png"));
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
  const x = lerp(from.x, to.x, blend), y = lerp(from.y, to.y, blend), scale = lerp(from.scale, to.scale, blend);
  const fadeW = lerp(from.fadeW, to.fadeW, blend), fadeH = lerp(from.fadeH, to.fadeH, blend);
  let opacity = ramp(T, 0.15, 0.7);
  if (mode === "none") opacity *= 1 - ramp(local, 0, 0.4, "linear");
  else if (prevMode === "none") opacity *= ramp(local, 0, 0.4, "linear");
  const open = speechOpen(cue, frame);
  const blink = blinkAmount(T);
  const assemble = ramp(T, 0.1, 1.2, "linear");
  const motion = mode === "small" ? 0.6 : 1;
  const yaw = (0.09 * Math.sin(T * 0.47) + 0.025 * Math.sin(T * 1.31)) * motion;
  const pitch = (0.045 * Math.sin(T * 0.33 + 1.2) + open * 0.025) * motion;
  const roll = 0.018 * Math.sin(T * 0.21 + 0.5) * motion;
  const [wx, wy] = toWorld(x, y);
  const floorShow = opacity * (mode === "big" ? 1 : prevMode === "big" ? 1 - blend : 0);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <ThreeCanvas width={width} height={height} camera={{ fov: FOV, position: [0, 0, CAM_Z] }} style={{ position: "absolute", inset: 0 }} gl={{ antialias: true, alpha: true }} flat>
        <ambientLight intensity={0.86} />
        <directionalLight position={[1.5, 2, 3]} intensity={0.34} />
        <directionalLight position={[-2, 0.5, 2]} intensity={0.12} color="#9ec5ff" />
        <Floor show={floorShow} />
        {texture ? (
          <group position={[wx, wy, 0]} rotation={[pitch, yaw, roll]} scale={[scale, scale, scale]}>
            <Head open={open} blink={blink} assemble={assemble} opacity={opacity} texture={texture} />
          </group>
        ) : null}
      </ThreeCanvas>
      <div style={{ position: "absolute", left: 0, bottom: 0, width: fadeW, height: fadeH, opacity, background: "linear-gradient(to bottom, rgba(9,12,19,0) 0%, rgba(9,12,19,0.9) 55%, #090c13 78%)" }} />
    </AbsoluteFill>
  );
};
