import React, { useMemo, useState } from "react";
import type { BlindSpot, MapPoint, Trace } from "@blindspot/core";
import { api, useApi } from "../lib/api";
import { money, pct, day, n } from "../lib/format";
import { CoverageMap, clusterColor } from "../components/CoverageMap";
import { ClaimDiff } from "../components/ClaimJson";
import { useToast } from "../components/Toasts";

interface CoverageRun {
  run_id: string;
  created_at: string;
  golden_version: string;
  window_start: string;
  window_end: string;
  threshold: number;
  coverage: number;
  covered: number;
  total: number;
  embedder: string;
  judge: string;
  analysis: { blind_spots: BlindSpot[]; map: MapPoint[]; selections: Record<string, { ids: string[]; roles: Record<string, string> }>; value_at_risk_total: number; trace_count: number; long_tail?: { clusters: number; traces: number; value: number; floor: number } };
}
interface SpotDetail extends BlindSpot {
  examples: Trace[];
  medoid: Trace | null;
  selection: { ids: string[]; roles: Record<string, string> } | null;
}

export const MapPage: React.FC<{ go: (r: "grading") => void }> = ({ go }) => {
  const { data, error } = useApi<CoverageRun>("/api/coverage/latest", ["coverage"]);
  const spots = useApi<SpotDetail[]>(data ? "/api/blindspots" : null, ["coverage"]);
  const golden = useApi<Array<{ case_id: string; claim: object }>>(data ? `/api/golden/${data.golden_version}` : null, ["golden"]);
  const queue = useApi<Array<{ cluster_id: string }>>("/api/grading/queue?status=pending", ["grading", "grade"]);
  const [selected, setSelected] = useState<string | null>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const detail = useMemo(() => spots.data?.find((s) => s.cluster_id === selected) ?? spots.data?.[0] ?? null, [spots.data, selected]);
  const goldenExample = golden.data?.[0] ?? null;
  if (error) return <div className="empty">No coverage run yet. Go to Overview and run coverage on the last 7 days.</div>;
  if (!data) return <div className="empty">Loading…</div>;
  const queued = new Set((queue.data ?? []).map((q) => q.cluster_id));
  const harvest = async () => {
    setBusy(true);
    try {
      const items = await api<unknown[]>("/api/harvest", { method: "POST", json: {} });
      toast(`${items.length} cases queued for expert grading`, "good");
      go("grading");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Where is the traffic the eval has never seen?</h1>
          <p>
            {n(data.total)} traces from {day(data.window_start)} to {day(data.window_end)} against golden <b>{data.golden_version}</b>. A trace is covered when its nearest golden case is at least as close as 95% of the golden set is to itself (cosine ≥ {data.threshold.toFixed(3)}, calibrated on a held-out slice). <b className={data.coverage < 0.85 ? "" : ""} style={{ color: data.coverage < 0.85 ? "var(--danger)" : "var(--success)" }}>{pct(data.coverage)} covered.</b>
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" disabled={busy || !data.analysis.blind_spots.length} onClick={() => void harvest()}>
            Harvest 10 cases per blind spot →
          </button>
        </div>
      </div>
      <div className="grid side">
        <div className="card">
          <CoverageMap points={data.analysis.map} blindSpots={data.analysis.blind_spots} selected={detail?.cluster_id ?? null} onSelect={setSelected} />
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="card-head" style={{ marginBottom: 0 }}>
            <h2>Blind spots, ranked</h2>
            <span className="small faint">{money(data.analysis.value_at_risk_total)} claimed in uncovered traffic (synthetic)</span>
          </div>
          <div className="formula">score = volume share × (0.25 + failure signal rate) × novelty</div>
          {data.analysis.blind_spots.length === 0 ? <div className="small muted">No cluster of uncovered traffic reaches the reporting floor. The golden set still looks like the traffic.</div> : null}
          {data.analysis.blind_spots.map((b, i) => (
            <button
              key={b.cluster_id}
              type="button"
              className="card"
              style={{ textAlign: "left", cursor: "pointer", padding: "10px 12px", borderColor: detail?.cluster_id === b.cluster_id ? clusterColor(b.cluster_id) : undefined, boxShadow: detail?.cluster_id === b.cluster_id ? `0 0 0 1px ${clusterColor(b.cluster_id)}` : undefined }}
              onClick={() => setSelected(b.cluster_id)}
              aria-pressed={detail?.cluster_id === b.cluster_id}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="dot" style={{ background: clusterColor(b.cluster_id) }} />
                <b>{b.cluster_id}</b>
                <span className="mono small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.name}
                </span>
                <span className="faint small" style={{ marginLeft: "auto" }}>
                  #{i + 1}
                </span>
              </div>
              <div className="small muted num" style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                <span>
                  <b style={{ color: "var(--text)" }}>{b.volume}</b> traces
                </span>
                <span>
                  <b style={{ color: b.failure_rate > 0.3 ? "var(--danger)" : "var(--text)" }}>{pct(b.failure_rate, 0)}</b> failing
                </span>
                <span>
                  <b style={{ color: "var(--text)" }}>{b.novelty.toFixed(2)}</b> novelty
                </span>
                <span>
                  <b style={{ color: "var(--text)" }}>{b.score.toFixed(3)}</b> score
                </span>
              </div>
              <div className="small faint" style={{ marginTop: 4 }}>
                {Object.entries(b.retailers)
                  .map(([r, c]) => `${r} ${c}`)
                  .join(" · ")}
                {" · "}
                {money(b.value_at_risk)} claimed
                {data.analysis.selections[b.cluster_id] ? ` · ${data.analysis.selections[b.cluster_id]?.ids.length} picked for grading` : " · below the harvest cut"}
                {queued.has(b.cluster_id) ? " · in queue" : ""}
              </div>
            </button>
          ))}
          {data.analysis.long_tail && data.analysis.long_tail.traces > 0 ? (
            <div className="small faint">
              Long tail: {n(data.analysis.long_tail.traces)} uncovered traces in {data.analysis.long_tail.clusters} groups smaller than the reporting floor ({data.analysis.long_tail.floor} traces). Shown on the map, not ranked.
            </div>
          ) : null}
        </div>
      </div>
      {detail && detail.medoid && goldenExample ? (
        <div className="card section">
          <div className="card-head">
            <h2>
              <span className="dot" style={{ background: clusterColor(detail.cluster_id), marginRight: 8 }} />
              {detail.cluster_id} · {detail.name} <span className="faint">· what the embedding picked up</span>
            </h2>
            <span className="small muted">
              medoid {detail.medoid.trace_id} · agent said <span className={`badge ${detail.medoid.output.decision.toLowerCase()}`}>{detail.medoid.output.decision}</span> ${detail.medoid.output.amount.toFixed(2)} · {detail.medoid.output.reason}
            </span>
          </div>
          <ClaimDiff left={{ title: `golden case ${goldenExample.case_id} (what the eval knows)`, claim: goldenExample.claim }} right={{ title: `${detail.medoid.trace_id} (the cluster's most typical claim)`, claim: detail.medoid.claim as object }} />
        </div>
      ) : null}
    </>
  );
};
