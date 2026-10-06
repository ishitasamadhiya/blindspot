import React from "react";
import type { SegmentMetric } from "@blindspot/core";
import { pct } from "../lib/format";

export const SegmentBars: React.FC<{ segments: SegmentMetric[]; threshold?: number; emptyText?: string }> = ({ segments, threshold = 0.8, emptyText = "No segments" }) =>
  segments.length === 0 ? (
    <div className="small muted">{emptyText}</div>
  ) : (
    <div>
      {segments.map((s) => (
        <div key={s.key} className={`segbar ${s.pass_rate < threshold ? "low" : ""}`}>
          <div className="name" title={s.label}>
            {s.label} <span className="faint">· {s.n}</span>
          </div>
          <div className="track">
            <div className="fill" style={{ width: `${s.pass_rate * 100}%` }} />
          </div>
          <div className="num" style={{ textAlign: "right", fontWeight: 600 }}>
            {pct(s.pass_rate, 0)}
            {s.pass_rate < threshold ? <span className="sr-only"> below threshold</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
