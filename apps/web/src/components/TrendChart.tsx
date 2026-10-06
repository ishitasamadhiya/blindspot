import React, { useState } from "react";

export interface Series {
  key: string;
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
}

export const TrendChart: React.FC<{
  labels: string[];
  series: Series[];
  height?: number;
  yFormat?: (v: number) => string;
  yMax?: number;
  marker?: { index: number; label: string };
  reveal?: number;
}> = ({ labels, series, height = 180, yFormat = (v) => `${Math.round(v * 100)}%`, yMax, marker, reveal = 1 }) => {
  const [hover, setHover] = useState<number | null>(null);
  const w = 640;
  const h = height;
  const padL = 44;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const n = labels.length;
  const max = yMax ?? Math.max(0.05, ...series.flatMap((s) => s.values)) * 1.1;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (w - padL - padR));
  const y = (v: number) => padT + (1 - Math.min(v, max) / max) * (h - padT - padB);
  const visible = Math.max(1, Math.ceil(n * reveal));
  const ticks = [0, max / 2, max];
  return (
    <div className="map-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={`${series.map((s) => `${s.label}: ${yFormat(s.values[0] ?? 0)} on ${labels[0] ?? ""} to ${yFormat(s.values[s.values.length - 1] ?? 0)} on ${labels[labels.length - 1] ?? ""}`).join("; ")}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={padL - 6} y={y(t) + 4} fontSize="10" textAnchor="end" fill="var(--text-3)">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % Math.ceil(n / 7) === 0 || i === n - 1 ? (
            <text key={l} x={x(i)} y={h - 8} fontSize="10" textAnchor="middle" fill="var(--text-3)">
              {l}
            </text>
          ) : null,
        )}
        {marker && marker.index < n ? (
          <g>
            <line x1={x(marker.index)} x2={x(marker.index)} y1={padT} y2={h - padB} stroke="var(--text-3)" strokeDasharray="3 3" />
            <text x={x(marker.index) + 4} y={padT + 10} fontSize="10" fill="var(--text-2)">
              {marker.label}
            </text>
          </g>
        ) : null}
        {series.map((s) => {
          const pts = s.values.slice(0, visible).map((v, i) => `${x(i)},${y(v)}`);
          return (
            <g key={s.key}>
              <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.slice(0, visible).map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4 : 2.2} fill={s.color} />
              ))}
            </g>
          );
        })}
        {labels.map((_, i) => (
          <rect key={i} x={x(i) - (w - padL - padR) / (2 * Math.max(1, n - 1))} y={padT} width={(w - padL - padR) / Math.max(1, n - 1)} height={h - padT - padB} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && hover < visible ? (
        <div className="chart-tip" style={{ left: `${(x(hover) / w) * 100}%`, top: `${(y(Math.max(...series.map((s) => s.values[hover] ?? 0))) / h) * 100}%` }}>
          <b>{labels[hover]}</b>
          {series.map((s) => (
            <div key={s.key}>
              <span className="dot" style={{ background: s.color, marginRight: 6 }} />
              {s.label}: {yFormat(s.values[hover] ?? 0)}
            </div>
          ))}
        </div>
      ) : null}
      <div className="map-legend">
        {series.map((s) => (
          <span key={s.key}>
            <span className="dot" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};
