import React from "react";
import type { Interval as IntervalT } from "@blindspot/core";
import { pct, pts } from "../lib/format";

export const IntervalBar: React.FC<{ interval: IntervalT; min: number; max: number; zero?: boolean; tone?: "accent" | "danger" | "success"; format?: "pct" | "pts" }> = ({ interval, min, max, zero = false, tone = "accent", format = "pct" }) => {
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
  const fmt = format === "pct" ? pct : pts;
  return (
    <div>
      <div className={`interval ${tone === "accent" ? "" : tone}`} aria-label={`${fmt(interval.estimate)} with interval ${fmt(interval.lo)} to ${fmt(interval.hi)}`}>
        {zero ? <div className="zero" style={{ left: pos(0) }} /> : null}
        <div className="range" style={{ left: pos(interval.lo), width: `calc(${pos(interval.hi)} - ${pos(interval.lo)})` }} />
        <div className="point" style={{ left: pos(interval.estimate) }} />
      </div>
      <div className="small muted num" style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span>{fmt(interval.lo)}</span>
        <span>
          <b style={{ color: "var(--text)" }}>{fmt(interval.estimate)}</b> · 95% CI, {interval.n_boot.toLocaleString()} paired resamples
        </span>
        <span>{fmt(interval.hi)}</span>
      </div>
    </div>
  );
};
