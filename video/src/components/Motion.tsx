import React from "react";
import { Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp01, ramp, useT } from "../lib/anim";

/** Slow camera move: scales and translates its children over the scene (Ken Burns for UI). */
export const Camera: React.FC<{ from?: number; to?: number; x?: number; y?: number; seconds: number; children: React.ReactNode; origin?: string; delay?: number }> = ({ from = 1, to = 1.04, x = 0, y = 0, seconds, children, origin = "50% 50%", delay = 0 }) => {
  const t = useT();
  const p = clamp01((t - delay) / Math.max(0.1, seconds - delay));
  const e = 1 - Math.pow(1 - p, 2);
  const s = from + (to - from) * e;
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translate(${x * e}px, ${y * e}px) scale(${s})`, transformOrigin: origin, willChange: "transform" }}>
      {children}
    </div>
  );
};

/** Counts from `from` to `to` over `duration` seconds starting at `start`, easing out. */
export const Counter: React.FC<{ from?: number; to: number; start: number; duration?: number; format?: (v: number) => string; style?: React.CSSProperties; className?: string }> = ({ from = 0, to, start, duration = 1.2, format = (v) => v.toFixed(1), style, className }) => {
  const t = useT();
  const p = ramp(t, start, duration);
  const v = from + (to - from) * p;
  return (
    <span className={className} style={style}>
      {format(v)}
    </span>
  );
};

/** A rubber-stamp impact: scales down from large with a quick settle, rotated slightly. */
export const Stamp: React.FC<{ at: number; children: React.ReactNode; color: string; rotate?: number; size?: number; style?: React.CSSProperties }> = ({ at, children, color, rotate = -6, size = 54, style }) => {
  const t = useT();
  const p = ramp(t, at, 0.22);
  const scale = 1.9 - 0.9 * p;
  const shake = p >= 1 ? Math.sin((t - at - 0.22) * 50) * Math.max(0, 1 - (t - at - 0.22) * 4) * 1.5 : 0;
  if (t < at) return null;
  return (
    <div style={{ opacity: Math.min(1, p * 1.4), transform: `rotate(${rotate + shake}deg) scale(${scale})`, transformOrigin: "center", ...style }}>
      <div style={{ border: `4px solid ${color}`, color, borderRadius: 12, padding: "8px 22px", fontSize: size, fontWeight: 700, letterSpacing: "0.04em", background: "rgba(13,17,23,0.82)", whiteSpace: "nowrap" }}>{children}</div>
    </div>
  );
};

/** A horizontal scan line that sweeps once across a box. */
export const ScanLine: React.FC<{ at: number; duration?: number; width: number; height: number; color?: string }> = ({ at, duration = 1.6, width, height, color = "var(--accent)" }) => {
  const t = useT();
  const p = ramp(t, at, duration, "inout");
  if (t < at || p >= 1) return null;
  return (
    <div style={{ position: "absolute", left: p * width - 2, top: 0, width: 3, height, background: color, boxShadow: `0 0 10px 2px ${color}`, opacity: 0.85, pointerEvents: "none" }}>
      <div style={{ position: "absolute", right: 0, top: 0, width: 160, height, background: `linear-gradient(90deg, transparent, ${color}22)` }} />
    </div>
  );
};

/** Plays a sound effect once at `at` seconds into the scene. */
export const Sfx: React.FC<{ name: string; at: number; volume?: number }> = ({ name, at, volume = 0.5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round(at * fps);
  if (frame < startFrame) return null;
  return <Audio src={staticFile(`audio/sfx/${name}.wav`)} volume={volume} startFrom={0} />;
};

const CHAPTERS = ["Who I am", "Noticed", "Investigated", "Built", "Shipped"] as const;
export type Chapter = (typeof CHAPTERS)[number];

/** Thin progress strip at the bottom: which chapter of the story we are in. */
export const ChapterBar: React.FC<{ chapter: Chapter; progress: number }> = ({ chapter, progress }) => {
  const idx = CHAPTERS.indexOf(chapter);
  return (
    <div style={{ position: "absolute", left: 96, right: 96, bottom: 30, display: "flex", gap: 10, alignItems: "center", fontSize: 14, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>
      {CHAPTERS.map((c, i) => (
        <div key={c} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ height: 3, borderRadius: 2, background: "var(--border-strong)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${i < idx ? 100 : i === idx ? progress * 100 : 0}%`, background: i <= idx ? "var(--accent)" : "transparent" }} />
          </div>
          <span style={{ color: i === idx ? "var(--accent)" : i < idx ? "var(--text-2)" : "var(--text-3)", fontWeight: i === idx ? 600 : 400 }}>{c}</span>
        </div>
      ))}
    </div>
  );
};

/** Live feed of claim rows arriving one by one. */
export const Ticker: React.FC<{ rows: Array<{ id: string; retailer: string; decision: string; amount: string; tone: "approve" | "reject" | "escalate" }>; start: number; every?: number; width?: number; highlightLast?: boolean }> = ({ rows, start, every = 0.16, width = 760, highlightLast = false }) => {
  const t = useT();
  const shown = Math.min(rows.length, Math.max(0, Math.floor((t - start) / every) + 1));
  return (
    <div style={{ width, display: "flex", flexDirection: "column", gap: 6, fontFamily: "JetBrains Mono, monospace", fontSize: 17 }}>
      {rows.slice(0, shown).map((r, i) => {
        const a = ramp(t, start + i * every, 0.18);
        const last = highlightLast && i === rows.length - 1;
        return (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 110px 110px", gap: 12, padding: "7px 12px", borderRadius: 8, background: last ? "var(--danger-soft)" : "var(--surface)", border: `1px solid ${last ? "var(--danger)" : "var(--border)"}`, opacity: a, transform: `translateY(${(1 - a) * -8}px)` }}>
            <span style={{ color: "var(--text-3)" }}>{r.id}</span>
            <span style={{ color: "var(--text-2)" }}>{r.retailer}</span>
            <span className={`badge ${r.tone}`} style={{ fontSize: 13, justifySelf: "start" }}>{r.decision}</span>
            <span className="num" style={{ textAlign: "right", fontWeight: 600, color: last ? "var(--danger)" : "var(--text)" }}>{r.amount}</span>
          </div>
        );
      })}
    </div>
  );
};
