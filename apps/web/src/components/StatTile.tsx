import React from "react";

export const StatTile: React.FC<{
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: "good" | "bad" | "warn" | "neutral";
  hint?: string;
}> = ({ label, value, sub, tone = "neutral", hint }) => (
  <div className={`tile ${tone}`} title={hint}>
    <div className="bar" />
    <div className="label">
      {label}
      {tone !== "neutral" ? <span className="sr-only">{tone === "good" ? " (healthy)" : tone === "bad" ? " (needs attention)" : " (warning)"}</span> : null}
    </div>
    <div className="value num">{value}</div>
    {sub ? <div className="sub">{sub}</div> : null}
  </div>
);
