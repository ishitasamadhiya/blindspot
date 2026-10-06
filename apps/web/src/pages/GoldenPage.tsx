import React, { useState } from "react";
import type { GoldenCase, GoldenVersion } from "@blindspot/core";
import { API_BASE, useApi } from "../lib/api";
import { VersionTimeline } from "../components/VersionTimeline";
import { ClaimJson } from "../components/ClaimJson";
import { clusterColor } from "../components/CoverageMap";
import { moneyFull } from "../lib/format";

export const GoldenPage: React.FC<{ go: (r: "releases") => void }> = ({ go }) => {
  const versions = useApi<GoldenVersion[]>("/api/golden/versions", ["golden"]);
  const overview = useApi<{ golden: { current: string } }>("/api/overview", ["golden"]);
  const current = overview.data?.golden.current ?? "v1";
  const [selected, setSelected] = useState<string | null>(null);
  const view = selected ?? current;
  const cases = useApi<GoldenCase[]>(`/api/golden/${view}`, ["golden"]);
  const vlist = versions.data ?? [];
  const idx = vlist.findIndex((v) => v.version === view);
  const parent = idx > 0 ? vlist[idx - 1] : null;
  const diff = useApi<{ added: GoldenCase[]; removed: string[] }>(parent ? `/api/golden/diff?from=${parent.version}&to=${view}` : null, ["golden"]);
  const bySource = (cases.data ?? []).reduce<Record<string, number>>((m, c) => ({ ...m, [c.source]: (m[c.source] ?? 0) + 1 }), {});
  const byCluster = (cases.data ?? []).filter((c) => c.cluster_name).reduce<Record<string, number>>((m, c) => ({ ...m, [`${c.cluster_id} · ${c.cluster_name}`]: (m[`${c.cluster_id} · ${c.cluster_name}`] ?? 0) + 1 }), {});
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Golden sets</h1>
          <p>Every version is immutable and content-addressed. Harvested cases carry the blind spot they came from, so the eval can report pass rates per blind spot and the gate can block on them.</p>
        </div>
        <div className="actions">
          <a className="btn" href={`${API_BASE}/api/golden/${view}/export.jsonl`} download>
            Export {view} as Foundry dataset (JSONL)
          </a>
          <button className="btn primary" onClick={() => go("releases")}>
            Evaluate a release on {current} →
          </button>
        </div>
      </div>
      <div className="grid side">
        <div className="card">
          <div className="card-head">
            <h2>
              {view} · {cases.data?.length ?? "…"} cases
            </h2>
            <span className="small muted">
              {Object.entries(bySource)
                .map(([k, v]) => `${v} ${k}`)
                .join(" · ")}
            </span>
          </div>
          {Object.keys(byCluster).length ? (
            <div className="small muted" style={{ marginBottom: 10 }}>
              {Object.entries(byCluster).map(([k, v]) => (
                <span key={k} className="badge neutral" style={{ marginRight: 6, marginBottom: 4 }}>
                  <span className="dot" style={{ background: clusterColor(k.split(" ")[0]) }} /> {k}: {v}
                </span>
              ))}
            </div>
          ) : null}
          {parent && diff.data ? (
            <div>
              <h3 style={{ marginBottom: 8 }}>
                Diff {parent.version} → {view}: <span style={{ color: "var(--success)" }}>+{diff.data.added.length}</span>
                {diff.data.removed.length ? <span style={{ color: "var(--danger)" }}> −{diff.data.removed.length}</span> : null}
              </h3>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>case</th>
                    <th>blind spot</th>
                    <th>expected</th>
                    <th>graded by</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.data.added.map((c) => (
                    <tr key={c.case_id}>
                      <td className="mono small">{c.case_id}</td>
                      <td className="small">
                        <span className="dot" style={{ background: clusterColor(c.cluster_id), marginRight: 6 }} />
                        {c.cluster_name}
                      </td>
                      <td className="small">
                        <span className={`badge ${c.expected.decision.toLowerCase()}`}>{c.expected.decision}</span> {c.expected.decision === "APPROVE" ? moneyFull(c.expected.amount) : ""}
                      </td>
                      <td className="small muted">{c.graded_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <h3 style={{ marginBottom: 8 }}>Sample case</h3>
              {cases.data?.[0] ? <ClaimJson claim={cases.data[0].claim} maxHeight={320} /> : null}
              <div className="small muted" style={{ marginTop: 8 }}>
                Expected: <span className={`badge ${cases.data?.[0]?.expected.decision.toLowerCase()}`}>{cases.data?.[0]?.expected.decision}</span> {cases.data?.[0]?.expected.decision === "APPROVE" ? moneyFull(cases.data[0].expected.amount) : ""} · graded by {cases.data?.[0]?.graded_by}
              </div>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Versions</h2>
          </div>
          <VersionTimeline versions={vlist} current={current} selected={view} onSelect={setSelected} />
          <div className="small faint">Export uses Foundry's evaluation dataset fields (query, response, ground_truth, context) so a version can be evaluated in Microsoft Foundry as-is.</div>
        </div>
      </div>
    </>
  );
};
