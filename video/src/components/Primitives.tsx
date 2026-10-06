import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp01, fadeOut, pop, ramp, useT } from "../lib/anim";

export const Scene: React.FC<{ seconds: number; children: React.ReactNode; grid?: boolean; style?: React.CSSProperties }> = ({ seconds, children, grid = true, style }) => {
  const t = useT();
  const opacity = Math.min(ramp(t, 0, 0.3, "linear"), fadeOut(t, seconds, 0.3));
  return (
    <AbsoluteFill className="vd" style={{ opacity, ...style }}>
      {grid ? <div className="grid-bg" /> : null}
      {children}
      <div className="vignette" />
    </AbsoluteFill>
  );
};

export const Kinetic: React.FC<{ text: string; start?: number; size?: number; color?: string; style?: React.CSSProperties; perWord?: number; align?: "left" | "center" }> = ({ text, start = 0, size = 64, color, style, perWord = 0.06, align = "left" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div className="kinetic" style={{ fontSize: size, color, textAlign: align, ...style }}>
      {words.map((w, i) => {
        const s = pop(frame, fps, Math.round((start + i * perWord) * fps));
        return (
          <span key={i} className="w" style={{ opacity: s, transform: `translateY(${(1 - s) * 18}px)` }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

export const Fade: React.FC<{ start: number; duration?: number; children: React.ReactNode; style?: React.CSSProperties; y?: number; className?: string; out?: number }> = ({ start, duration = 0.35, children, style, y = 14, className, out }) => {
  const t = useT();
  let a = ramp(t, start, duration);
  if (out !== undefined) a = Math.min(a, 1 - ramp(t, out, 0.3, "linear"));
  return (
    <div className={className} style={{ opacity: a, transform: `translateY(${(1 - a) * y}px)`, ...style }}>
      {children}
    </div>
  );
};

export const Caption: React.FC<{ start: number; children: React.ReactNode; out?: number }> = ({ start, children, out }) => (
  <Fade start={start} out={out} className="caption" y={10}>
    <div className="bar" />
    <div>{children}</div>
  </Fade>
);

export const Eyebrow: React.FC<{ start: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ start, children, style }) => (
  <Fade start={start} className="eyebrow" style={style}>
    {children}
  </Fade>
);

export const Window: React.FC<{ title: string; width: number; style?: React.CSSProperties; children: React.ReactNode; scale?: number; bodyStyle?: React.CSSProperties }> = ({ title, width, style, children, scale = 1, bodyStyle }) => (
  <div className="window" style={{ width, ...style }}>
    <div className="titlebar">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
      <span className="t">{title}</span>
    </div>
    <div className="body" style={{ transformOrigin: "top left", transform: `scale(${scale})`, width: `${100 / scale}%`, ...bodyStyle }}>
      {children}
    </div>
  </div>
);

export interface CodeLine {
  text: string;
  hl?: boolean;
}

function colorize(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\/\/.*$|"[^"]*"|`[^`]*`|\b(?:export|function|const|let|return|if|for|of|new|import|from|type|interface|await|async|throw|else)\b|\b\d+(?:\.\d+)?\b|\b[A-Z][A-Za-z0-9]+\b|\b[a-zA-Z_][a-zA-Z0-9_]*(?=\())/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    const tok = m[0];
    const cls = tok.startsWith("//") ? "cm" : tok.startsWith('"') || tok.startsWith("`") ? "st" : /^\d/.test(tok) ? "nu" : /^[A-Z]/.test(tok) ? "ty" : /\($/.test(line.slice(m.index, m.index + tok.length + 1)) ? "fn" : "kw";
    parts.push(
      <span key={k++} className={cls}>
        {tok}
      </span>,
    );
    last = m.index + tok.length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

export const Code: React.FC<{ file: string; lines: CodeLine[]; start: number; perLine?: number; style?: React.CSSProperties; width?: number; hlStart?: number }> = ({ file, lines, start, perLine = 0.07, style, width, hlStart }) => {
  const t = useT();
  return (
    <div className="code" style={{ width, ...style }}>
      <div className="file">{file}</div>
      {lines.map((l, i) => {
        const a = ramp(t, start + i * perLine, 0.25);
        const hl = l.hl && (hlStart === undefined || t >= hlStart);
        return (
          <div key={i} className={`ln ${hl ? "hl" : ""}`} style={{ opacity: a, transform: `translateX(${(1 - a) * -10}px)` }}>
            <span className="n">{i + 1}</span>
            <span>{colorize(l.text)}</span>
          </div>
        );
      })}
    </div>
  );
};

export interface TermLine {
  text: string;
  cls?: "p" | "ok" | "bad" | "dim";
  at: number;
}

export const Terminal: React.FC<{ lines: TermLine[]; width?: number; style?: React.CSSProperties; typeFirst?: boolean }> = ({ lines, width = 1100, style, typeFirst = true }) => {
  const t = useT();
  return (
    <div className="term" style={{ width, ...style }}>
      {lines.map((l, i) => {
        if (t < l.at) return null;
        const isCmd = l.cls === "p";
        const text = isCmd && typeFirst ? l.text.slice(0, Math.floor((t - l.at) * 38)) : l.text;
        const done = !isCmd || text.length >= l.text.length;
        return (
          <div key={i} className={l.cls ?? ""} style={{ opacity: isCmd ? 1 : clamp01((t - l.at) / 0.15) }}>
            {isCmd ? <span className="p">$ </span> : null}
            <span style={{ color: isCmd ? "#e6edf3" : undefined }}>{text}</span>
            {isCmd && !done ? <span className="cursor" /> : null}
          </div>
        );
      })}
    </div>
  );
};

export const Pointer: React.FC<{ path: Array<{ x: number; y: number; at: number; click?: boolean }> }> = ({ path }) => {
  const t = useT();
  if (path.length === 0 || t < path[0]!.at - 0.4) return null;
  let i = 0;
  while (i < path.length - 1 && t >= path[i + 1]!.at) i++;
  const a = path[i]!;
  const b = path[Math.min(i + 1, path.length - 1)]!;
  const span = Math.max(0.01, b.at - a.at);
  const x = a.x + (b.x - a.x) * ramp(t, a.at, span, "inout");
  const y = a.y + (b.y - a.y) * ramp(t, a.at, span, "inout");
  const click = path.find((p) => p.click && t >= p.at && t < p.at + 0.5);
  return (
    <>
      {click ? <div className="ripple" style={{ left: click.x, top: click.y, opacity: 1 - (t - click.at) / 0.5, transform: `translate(-50%, -50%) scale(${0.4 + (t - click.at) * 2})` }} /> : null}
      <svg className="cursor-pointer" viewBox="0 0 26 32" style={{ left: x, top: y, opacity: ramp(t, path[0]!.at - 0.4, 0.3) }}>
        <path d="M2 2 L2 24 L8 18 L12 28 L16 26 L12 17 L21 17 Z" fill="#fff" stroke="#111" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </>
  );
};

export const Logo: React.FC<{ size?: number }> = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="13" fill="none" stroke="var(--accent)" strokeWidth="3" />
    <circle cx="22" cy="11" r="4.5" fill="var(--uncovered)" />
  </svg>
);

export const Shot: React.FC<{ file: string; style?: React.CSSProperties }> = ({ file, style }) => <Img src={staticFile(file)} style={style} />;
