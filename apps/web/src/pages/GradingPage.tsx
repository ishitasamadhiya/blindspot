import React, { useMemo, useState } from "react";
import type { Decision } from "@blindspot/core";
import { api, useApi } from "../lib/api";
import { GradingCard, type GradingItemView } from "../components/GradingCard";
import { AgreementMeters, type AgreementRow } from "../components/Agreement";
import { useToast } from "../components/Toasts";
import { clusterColor } from "../components/CoverageMap";
import { topLevelDiff } from "../components/ClaimJson";

export const GradingPage: React.FC<{ go: (r: "golden" | "map") => void }> = ({ go }) => {
  const queue = useApi<GradingItemView[]>("/api/grading/queue", ["grading", "grade", "golden"]);
  const agreement = useApi<AgreementRow[]>("/api/grading/agreement", ["grading", "grade"]);
  const golden = useApi<Array<{ case_id: string; claim: object }>>("/api/golden/v1", []);
  const toast = useToast();
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const items = queue.data ?? [];
  const pending = items.filter((i) => i.status === "pending");
  const current = pending[Math.min(cursor, Math.max(0, pending.length - 1))] ?? null;
  const highlight = useMemo(() => {
    if (!current?.trace || !golden.data?.[0]) return [];
    return topLevelDiff(golden.data[0].claim, current.trace.claim as object).onlyB;
  }, [current, golden.data]);
  const grade = async (g: { decision: Decision; amount: number; note: string }) => {
    if (!current) return;
    setBusy(true);
    try {
      await api(`/api/grading/${current.item_id}`, { method: "POST", json: { ...g, grader: "expert:you" } });
      setCursor(0);
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const simulate = async () => {
    setBusy(true);
    try {
      toast("Contoso's analysts are grading the queue (demo: labels come from the seed)…");
      const r = await api<{ graded: number }>("/api/demo/simulate-analyst", { method: "POST", json: { delay_ms: 120 } });
      toast(`${r.graded} cases graded`, "good");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    setBusy(true);
    try {
      const v = await api<{ version: string; case_ids: string[] }>("/api/golden/commit", { method: "POST", json: {} });
      toast(`Golden ${v.version} committed with ${v.case_ids.length} cases`, "good");
      go("golden");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const graded = items.filter((i) => i.status === "graded").length;
  if (queue.error) return <div className="empty">{queue.error}</div>;
  if (!queue.data) return <div className="empty">Loading…</div>;
  if (items.length === 0)
    return (
      <div className="empty">
        Nothing to grade. <a href="#/map">Harvest cases from the blind spots</a> first.
      </div>
    );
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Grade ten, not a thousand</h1>
          <p>
            {items.length} cases picked from the blind spots: each cluster's medoid, its nearest neighbours, two random draws and the traces where the judge was unsure or disagreed with the agent. {graded} graded, {pending.length} pending.
          </p>
        </div>
        <div className="actions">
          <button className="btn" disabled={busy || pending.length === 0} onClick={() => void simulate()} title="Demo only: fills in the analysts' labels from the seed">
            Let Contoso's analysts finish (demo)
          </button>
          <button className="btn primary" disabled={busy || graded === 0} onClick={() => void commit()}>
            Commit golden set with {graded} new cases →
          </button>
        </div>
      </div>
      <div className="progress" style={{ marginBottom: 14 }}>
        <div style={{ width: `${(graded / items.length) * 100}%` }} />
      </div>
      {current ? <GradingCard item={current} index={items.findIndex((i) => i.item_id === current.item_id)} total={items.length} onGrade={grade} onSkip={() => setCursor((c) => (c + 1) % Math.max(1, pending.length))} highlight={highlight} busy={busy} /> : <div className="card">All {items.length} cases graded. Commit them as a new golden version.</div>}
      <div className="grid cols-2 section">
        <div className="card">
          <div className="card-head">
            <h2>Can the judge be trusted here?</h2>
          </div>
          <AgreementMeters rows={agreement.data ?? []} judgeName={current?.judge?.judge ?? items[0]?.judge?.judge} />
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Queue</h2>
            <a href="#/map" className="small">
              back to map
            </a>
          </div>
          <table className="tbl">
            <tbody>
              {items.map((i) => (
                <tr key={i.item_id} className={`clickable ${current?.item_id === i.item_id ? "selected" : ""}`} onClick={() => setCursor(Math.max(0, pending.findIndex((p) => p.item_id === i.item_id)))}>
                  <td>
                    <span className="dot" style={{ background: clusterColor(i.cluster_id), marginRight: 8 }} />
                    <span className="mono small">{i.trace_id}</span>
                  </td>
                  <td className="small muted">{i.role}</td>
                  <td className="small">{i.judge ? <span className={`badge ${i.judge.pass ? "pass" : "blocked"}`}>judge: {i.judge.pass ? "ok" : "wrong"}</span> : null}</td>
                  <td className="small">{i.expert ? <span className={`badge ${i.expert.decision.toLowerCase()}`}>{i.expert.decision}</span> : <span className="faint">pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};
