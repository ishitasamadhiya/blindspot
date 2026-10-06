import React from "react";
import type { GateResult } from "@blindspot/core";

export const GateBanner: React.FC<{ gate: GateResult; title?: string }> = ({ gate, title }) => {
  const failing = gate.checks.filter((c) => !c.pass);
  return (
    <div className={`gate-banner ${gate.status}`} role="status">
      <span className="big">{gate.status === "PASS" ? "✓ PASS" : "✗ BLOCKED"}</span>
      <div>
        <div style={{ fontWeight: 600 }}>{title ?? (gate.status === "PASS" ? "Release can ship" : "Release blocked")}</div>
        <div className="small" style={{ opacity: 0.9 }}>
          {gate.status === "PASS" ? `${gate.checks.length} checks passed` : failing.map((c) => c.name).join(" · ")}
        </div>
      </div>
    </div>
  );
};

export const GateChecks: React.FC<{ gate: GateResult; reveal?: number }> = ({ gate, reveal = 1 }) => (
  <div className="checks">
    {gate.checks.slice(0, Math.ceil(gate.checks.length * reveal)).map((c, i) => (
      <div key={i} className={`check ${c.pass ? "pass" : "fail"}`}>
        <div className="mark">{c.pass ? "✓" : "✗"}</div>
        <div>
          <div style={{ fontWeight: 600 }}>{c.name}</div>
          <div className="detail">{c.detail}</div>
        </div>
        <div className="small num muted" style={{ whiteSpace: "nowrap" }}>
          {c.value === null ? "–" : `${(c.value * 100).toFixed(1)}%`} <span className="faint">vs {c.threshold >= 0 ? "≥" : "≥"} {(c.threshold * 100).toFixed(0)}%</span>
        </div>
      </div>
    ))}
  </div>
);
