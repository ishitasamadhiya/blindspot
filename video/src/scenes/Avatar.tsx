import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { Eyebrow, Fade, Kinetic, Logo, Scene, Shot } from "../components/Primitives";
import { Sfx } from "../components/Motion";
import { clamp01, ramp, useT } from "../lib/anim";
import portrait from "../data/portrait.json";
import timing from "../data/timing.json";

const DATA = portrait as { n: number; pos: number[]; col: number[]; start: number[] };
const ENVELOPE: number[] = ((timing as Record<string, { envelope?: number[] }>).avatar?.envelope ?? []) as number[];
const SCALE = 0.5;
const CENTER = new THREE.Vector3(-1.12, 0.02, 0);

const ease = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

const Particles: React.FC<{ assemble: number; spin: number; fade: number }> = ({ assemble, spin, fade }) => {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(DATA.n * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(Float32Array.from(DATA.col), 3));
    return g;
  }, []);
  const mat = useMemo(() => new THREE.PointsMaterial({ size: 0.0115, vertexColors: true, transparent: true, opacity: 1, sizeAttenuation: true, depthWrite: false }), []);
  const ref = useRef<THREE.Points>(null);
  useLayoutEffect(() => {
    const attr = geom.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const e = ease(assemble);
    for (let i = 0; i < DATA.n; i++) {
      // each point lands a little after the previous (staggered by index), so the face sweeps into place
      const local = ease(clamp01((assemble - (i / DATA.n) * 0.35) / 0.65));
      const k = Math.max(e * 0.3, local);
      arr[i * 3] = (DATA.start[i * 3] as number) * (1 - k) + (DATA.pos[i * 3] as number) * k;
      arr[i * 3 + 1] = (DATA.start[i * 3 + 1] as number) * (1 - k) + (DATA.pos[i * 3 + 1] as number) * k;
      arr[i * 3 + 2] = (DATA.start[i * 3 + 2] as number) * (1 - k) + (DATA.pos[i * 3 + 2] as number) * k;
    }
    attr.needsUpdate = true;
    mat.opacity = fade;
    mat.size = 0.0115 + (1 - e) * 0.012;
  }, [assemble, fade, geom, mat]);
  return (
    <points ref={ref} geometry={geom} material={mat} position={CENTER} rotation={[spin * 0.35, spin, 0]} scale={[SCALE, SCALE, SCALE]} />
  );
};

const Rings: React.FC<{ amp: number; show: number; spin: number }> = ({ amp, show, spin }) => (
  <group position={CENTER} rotation={[0.35 + spin * 0.4, spin * 1.4, 0.1]}>
    <mesh>
      <torusGeometry args={[SCALE * 1.18, 0.006, 16, 160]} />
      <meshStandardMaterial color="#4f9ee8" emissive="#4f9ee8" emissiveIntensity={1.2 + amp * 4} transparent opacity={0.55 * show} />
    </mesh>
    <mesh rotation={[1.2, 0.3, 0]}>
      <torusGeometry args={[SCALE * 1.34, 0.004, 12, 160]} />
      <meshStandardMaterial color="#9aa4b1" emissive="#9aa4b1" emissiveIntensity={0.3 + amp * 1.5} transparent opacity={0.35 * show} />
    </mesh>
  </group>
);

const Floor: React.FC<{ show: number }> = ({ show }) => {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(14, 40, 0x2a3442, 0x1a2230);
    (g.material as THREE.Material).transparent = true;
    return g;
  }, []);
  useLayoutEffect(() => {
    (grid.material as THREE.Material).opacity = 0.35 * show;
  }, [grid, show]);
  return <primitive object={grid} position={[0, -1.25, -1]} />;
};

export const Avatar: React.FC<{ seconds: number }> = ({ seconds }) => {
  const t = useT();
  const { width, height, fps } = useVideoConfig();
  const assemble = ramp(t, 0.3, 2.6, "linear");
  const settle = ramp(t, 3.2, 0.9, "inout");
  const spin = (1 - settle) * Math.sin(t * 1.1) * 0.55 + settle * Math.sin(t * 0.6) * 0.06;
  const photoIn = ramp(t, 3.4, 0.8);
  const frame = Math.floor(t * fps);
  const amp = ENVELOPE.length ? Math.min(1, (ENVELOPE[Math.min(frame, ENVELOPE.length - 1)] ?? 0) * 6) : 0;
  const show = ramp(t, 0.6, 1.2);
  // the particle disc occupies radius SCALE at z=0 with a 40° camera at z=3.2: half-height visible = 3.2·tan(20°)
  const halfVisible = 3.2 * Math.tan((20 * Math.PI) / 180);
  const pxPerUnit = height / 2 / halfVisible;
  const cx = width / 2 + CENTER.x * pxPerUnit;
  const cy = height / 2 - CENTER.y * pxPerUnit;
  const diameter = SCALE * 2 * pxPerUnit;
  return (
    <Scene seconds={seconds} grid={false}>
      <Sfx name="riser" at={0.2} volume={0.28} />
      <Sfx name="whoosh" at={3.3} volume={0.3} />
      <Sfx name="click" at={4.2} volume={0.3} />
      <ThreeCanvas width={width} height={height} camera={{ fov: 40, position: [0, 0, 3.2] }} style={{ position: "absolute", inset: 0 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.8} />
        <pointLight position={[-2, 2, 3]} intensity={6} color="#4f9ee8" />
        <pointLight position={[2, -1, 2]} intensity={3} color="#ff8a5c" />
        <Floor show={show} />
        <Particles assemble={assemble} spin={spin} fade={1 - photoIn * 0.85} />
        <Rings amp={amp} show={show} spin={spin} />
      </ThreeCanvas>
      <div style={{ position: "absolute", left: cx - diameter / 2, top: cy - diameter / 2, width: diameter, height: diameter, opacity: photoIn, transform: `scale(${0.96 + photoIn * 0.04})` }}>
        <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", boxShadow: `0 0 ${30 + amp * 60}px rgba(79,158,232,${0.25 + amp * 0.5})` }}>
          <Shot file="photo/headshot.jpeg" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div style={{ position: "absolute", inset: -6, borderRadius: "50%", border: "2px solid var(--accent)", opacity: 0.35 + amp * 0.6, transform: `scale(${1 + amp * 0.03})` }} />
        <div style={{ position: "absolute", right: -18, bottom: 18, background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 999, padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "var(--text-2)" }}>
          <Logo size={22} /> Blindspot
        </div>
      </div>
      <div style={{ position: "absolute", left: 760, top: 300, maxWidth: 1080 }}>
        <Eyebrow start={0.5}>Who I am</Eyebrow>
        <div style={{ marginTop: 10 }}>
          <Kinetic text="Ishita Samadhiya" start={0.7} size={80} />
        </div>
        <Fade start={1.9} style={{ fontSize: 32, color: "var(--text-2)", marginTop: 12 }}>
          EECS + Business · Berkeley M.E.T. · Class of 2028
        </Fade>
        <div style={{ marginTop: 40 }}>
          <Kinetic text="Finds messy product problems, works out what actually matters, and builds the system that fixes them." start={3.6} size={42} color="var(--text)" perWord={0.045} />
        </div>
        <Fade start={7.4} style={{ marginTop: 26, fontSize: 30, color: "var(--accent)", fontWeight: 600 }}>
          That is the forward-deployed job.
        </Fade>
      </div>
    </Scene>
  );
};
