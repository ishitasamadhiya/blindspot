import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const FPS = 30;

export function useT(): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function ramp(t: number, start: number, duration: number, easing: "out" | "inout" | "linear" = "out"): number {
  const x = clamp01((t - start) / Math.max(1e-6, duration));
  if (easing === "linear") return x;
  if (easing === "inout") return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  return 1 - Math.pow(1 - x, 3);
}

export function pop(frame: number, fps: number, delayFrames = 0): number {
  return spring({ frame: frame - delayFrames, fps, config: { damping: 18, stiffness: 160, mass: 0.7 } });
}

export function fadeOut(t: number, sceneSeconds: number, duration = 0.35): number {
  return 1 - clamp01((t - (sceneSeconds - duration)) / duration);
}

export function typed(text: string, t: number, start: number, cps = 45): string {
  const n = Math.max(0, Math.floor((t - start) * cps));
  return text.slice(0, n);
}

export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;

export { interpolate };
