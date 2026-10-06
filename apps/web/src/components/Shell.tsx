import React from "react";
import type { Route } from "../lib/router";

export const Logo: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="13" fill="none" stroke="var(--accent)" strokeWidth="3" />
    <circle cx="22" cy="11" r="4.5" fill="var(--uncovered)" />
  </svg>
);

const NAV: Array<{ key: Route; label: string; step: string }> = [
  { key: "overview", label: "Overview", step: "0" },
  { key: "map", label: "Blind spots", step: "1" },
  { key: "grading", label: "Grading queue", step: "2" },
  { key: "golden", label: "Golden sets", step: "3" },
  { key: "releases", label: "Release gate", step: "4" },
];

export const Shell: React.FC<{ route: Route; engagement?: { customer: string; agent: string } | null; children: React.ReactNode; embedder?: string; judge?: string }> = ({ route, engagement, children, embedder, judge }) => (
  <div className="shell">
    <aside className="sidebar">
      <div className="brand">
        <Logo />
        <b>Blindspot</b>
        <span className="tag">prototype</span>
      </div>
      <nav className="nav" aria-label="primary">
        {NAV.map((n) => (
          <a key={n.key} href={`#/${n.key}`} className={route === n.key ? "active" : ""} aria-current={route === n.key ? "page" : undefined}>
            <span className="step">{n.step}</span>
            {n.label}
          </a>
        ))}
      </nav>
      <div className="engagement">
        <b>{engagement?.customer ?? "—"}</b>
        {engagement?.agent ?? ""}
        <div className="faint" style={{ marginTop: 8 }}>
          embedder {embedder ?? "…"}
          <br />
          judge {judge ?? "…"}
        </div>
      </div>
    </aside>
    <main className="main">{children}</main>
  </div>
);
