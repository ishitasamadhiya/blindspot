import React from "react";
import { pct } from "../lib/format";

export interface AgreementRow {
  cluster_id: string;
  cluster_name: string;
  graded: number;
  pending: number;
  agreement: number | null;
  kappa: number | null;
  mean_judge_confidence: number | null;
  expert_pass_rate: number | null;
}

export const AgreementMeters: React.FC<{ rows: AgreementRow[]; judgeName?: string }> = ({ rows, judgeName }) => (
  <div>
    <div className="meter" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-2)", fontWeight: 600 }}>
      <span>blind spot</span>
      <span>judge ↔ expert</span>
      <span>κ</span>
      <span>conf.</span>
    </div>
    {rows.map((r) => (
      <div key={r.cluster_id} className="meter">
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.cluster_name}>
          {r.cluster_id} · {r.cluster_name}
          <span className="faint">
            {" "}
            · {r.graded}/{r.graded + r.pending} graded
          </span>
        </span>
        <span>
          <div className="progress" title={r.agreement === null ? "no graded cases yet" : `${pct(r.agreement)} agreement`}>
            <div style={{ width: `${(r.agreement ?? 0) * 100}%`, background: (r.agreement ?? 0) >= 0.8 ? "var(--success)" : "var(--danger)" }} />
          </div>
        </span>
        <span className="num">{r.kappa === null || Number.isNaN(r.kappa) ? "–" : r.kappa.toFixed(2)}</span>
        <span className="num muted">{r.mean_judge_confidence === null ? "–" : r.mean_judge_confidence.toFixed(2)}</span>
      </div>
    ))}
    <div className="small faint" style={{ marginTop: 8 }}>
      Agreement is judge pass/fail versus the expert's label on the same case{judgeName ? ` (judge: ${judgeName})` : ""}. Below 80% the judge cannot be trusted unattended on that blind spot.
    </div>
  </div>
);
