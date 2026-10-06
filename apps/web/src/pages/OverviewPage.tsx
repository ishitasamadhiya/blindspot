import React, { useState } from "react";
import type { BlindSpot, EvalMetrics, GateResult, GoldenVersion } from "@blindspot/core";
import { api, useApi } from "../lib/api";
import { money, pct, day, n } from "../lib/format";
import { StatTile } from "../components/StatTile";
import { TrendChart } from "../components/TrendChart";
import { JobPipeline, type JobView } from "../components/JobPipeline";
import { useToast } from "../components/Toasts";

export interface Overview {
  engagement: { customer: string; agent: string; description: string; deployed: string };
  golden: { current: string; versions: GoldenVersion[] };
  eval: { run_id: string; golden_version: string; agent_version: string; release_tag: string; n: number; metrics: EvalMetrics | null; gate: (GateResult & { coverage: number | null }) | null } | null;
  coverage: { run_id: string; created_at: string; golden_version: string; window_start: string; window_end: string; coverage: number; covered: number; total: number; threshold: number; blind_spots: Array<Omit<BlindSpot, "trace_ids">>; value_at_risk_total: number; long_tail: { clusters: number; traces: number; value: number; floor: number } | null; traces_since: number; embedder: string; judge: string } | null;
  traffic: { total: number; latest: string | null; daily: Array<{ day: string; volume: number; overrides: number; escalations: number; zero_dollar_approvals: number }>; replay: { pending: number; from: string | null; to: string | null } };
  grading: Array<{ cluster_id: string; graded: number; pending: number }>;
  jobs: JobView[];
  embedder: string;
  judge: string;
}

export const OverviewPage: React.FC<{ go: (r: "map" | "grading" | "golden" | "releases") => void }> = ({ go }) => {
  const { data, error } = useApi<Overview>("/api/overview", ["*"]);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <div className="empty">Cannot reach the API: {error}</div>;
  if (!data) return <div className="empty">Loading…</div>;
  const daily = data.traffic.daily;
  const last7 = daily.slice(-7);
  const sum = (k: "volume" | "overrides" | "escalations" | "zero_dollar_approvals", d = last7) => d.reduce((s, x) => s + x[k], 0);
  const overrideRate = sum("volume") ? sum("overrides") / sum("volume") : 0;
  const first7 = daily.slice(0, 7);
  const baseOverride = sum("volume", first7) ? sum("overrides", first7) / sum("volume", first7) : 0;
  const acc = data.eval?.metrics?.accuracy ?? null;
  const cov = data.coverage;
  const stale = cov ? cov.traces_since : 0;
  const run = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    try {
      await fn();
      if (done) toast(done, "good");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };
  const latestJob = data.jobs[0];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {data.engagement.customer} <span className="faint">·</span> {data.engagement.agent}
          </h1>
          <p>{data.engagement.description} Deployed into the customer tenant on {day(data.engagement.deployed)}.</p>
        </div>
        <div className="actions">
          {data.traffic.replay.pending > 0 ? (
            <button className="btn" disabled={!!busy} onClick={() => run("replay", () => api("/api/demo/replay", { method: "POST", json: { seconds: 18 } }), `Replaying ${n(data.traffic.replay.pending)} traces over 18 seconds`)}>
              {busy === "replay" ? <span className="spinner" /> : "▶"} Replay next 7 days of traffic
            </button>
          ) : null}
          <button className="btn primary" disabled={!!busy} onClick={() => run("coverage", () => api("/api/coverage/run", { method: "POST", json: { window_days: 7 } }), "Coverage job started")}>
            Run coverage on last 7 days
          </button>
        </div>
      </div>

      <div className="grid cols-4">
        <StatTile label={`Eval accuracy · golden ${data.eval?.golden_version ?? data.golden.current} · ${data.eval?.release_tag ?? "no run"}`} value={acc ? pct(acc.estimate) : "–"} sub={acc ? `95% CI ${pct(acc.lo)} – ${pct(acc.hi)} on ${data.eval?.n} cases` : "run an evaluation"} tone={acc ? (acc.estimate >= 0.9 ? "good" : "warn") : "neutral"} />
        <StatTile
          label={cov ? `Coverage · last 7 days vs golden ${cov.golden_version}` : "Coverage · last 7 days"}
          value={cov ? pct(cov.coverage) : "–"}
          sub={cov ? (stale > 0 ? `${n(stale)} traces arrived since this run` : `${n(cov.covered)} of ${n(cov.total)} traces within the golden set's neighbourhood`) : "not measured yet"}
          tone={cov ? (cov.coverage >= 0.85 ? "good" : "bad") : "neutral"}
          hint="Share of recent production traffic that sits within the golden set's own neighbourhood (threshold calibrated on the golden set)."
        />
        <StatTile label="Analyst override rate · last 7 days" value={pct(overrideRate)} sub={`was ${pct(baseOverride)} in the first week · ${n(sum("escalations"))} escalations · ${n(sum("zero_dollar_approvals"))} $0 approvals`} tone={overrideRate > baseOverride * 1.5 ? "bad" : "good"} />
        <StatTile label="Claim value in uncovered traffic" value={cov ? money(cov.value_at_risk_total) : "–"} sub="synthetic amounts, summed from seeded claims" tone={cov && cov.value_at_risk_total > 0 ? "warn" : "neutral"} />
      </div>

      <div className="grid side section">
        <div className="card">
          <div className="card-head">
            <h2>Production signals by day</h2>
            <span className="small faint">{n(data.traffic.total)} traces ingested · latest {data.traffic.latest ? day(data.traffic.latest) : "–"}</span>
          </div>
          <TrendChart
            labels={daily.map((d) => day(d.day))}
            series={[
              { key: "override", label: "analyst override rate", color: "var(--danger)", values: daily.map((d) => (d.volume ? d.overrides / d.volume : 0)) },
              { key: "esc", label: "escalation rate", color: "var(--warning)", values: daily.map((d) => (d.volume ? d.escalations / d.volume : 0)) },
              { key: "zero", label: "$0 approvals", color: "var(--accent)", values: daily.map((d) => (d.volume ? d.zero_dollar_approvals / d.volume : 0)), dashed: true },
            ]}
            yMax={0.5}
            marker={daily.length > 7 ? { index: 7, label: "Northwind portal v2 export goes live" } : undefined}
          />
          <p className="small muted" style={{ marginTop: 10 }}>
            The eval re-runs on every release and stays green. These signals are what the customer sees. Both can be true at once when the golden set no longer resembles the traffic.
          </p>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Blind spots</h2>
            {cov ? (
              <a href="#/map" className="small">
                open map →
              </a>
            ) : null}
          </div>
          {!cov ? (
            <div className="small muted">Run coverage to find the traffic the golden set has never seen.</div>
          ) : cov.blind_spots.length === 0 ? (
            <div className="small muted">
              No cluster of uncovered traffic reaches the reporting floor{cov.long_tail ? ` (${cov.long_tail.floor} traces); ${n(cov.long_tail.traces)} uncovered traces sit in a long tail of ${cov.long_tail.clusters} small groups` : ""}. The golden set still looks like the traffic.
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>cluster</th>
                  <th className="num">traces</th>
                  <th className="num">failing</th>
                  <th className="num">score</th>
                </tr>
              </thead>
              <tbody>
                {cov.blind_spots.slice(0, 4).map((b) => (
                  <tr key={b.cluster_id} className="clickable" onClick={() => go("map")}>
                    <td>
                      <b>{b.cluster_id}</b> <span className="muted">{b.name}</span>
                    </td>
                    <td className="num">{b.volume}</td>
                    <td className="num">{pct(b.failure_rate, 0)}</td>
                    <td className="num">{b.score.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {cov?.long_tail && cov.blind_spots.length > 0 && cov.long_tail.traces > 0 ? (
            <div className="small faint" style={{ marginTop: 8 }}>
              + {n(cov.long_tail.traces)} uncovered traces in {cov.long_tail.clusters} groups below the reporting floor of {cov.long_tail.floor}
            </div>
          ) : null}
          <div className="section small muted">
            Grading: {data.grading.reduce((s, g) => s + g.graded, 0)} graded, {data.grading.reduce((s, g) => s + g.pending, 0)} pending ·{" "}
            <a href="#/grading">queue →</a>
          </div>
        </div>
      </div>

      {latestJob ? (
        <div className="card section">
          <JobPipeline job={latestJob} />
        </div>
      ) : null}

      <div className="card section small muted">
        <b style={{ color: "var(--text)" }}>What is real and what is seeded.</b> The golden set, the production traces and the analyst labels are generated from a fixed seed; the retailer's portal-v2 export, the scan-back promo and the co-op claims are seeded as traffic shapes, never as labels. Everything downstream is computed by the code in this repo: the embeddings, the coverage threshold, the clusters and their names, the judge pre-grades (a simulated judge unless Azure OpenAI is configured), the agent's decisions, the bootstrap intervals and the gate. Embedder in use: <span className="mono">{data.embedder}</span>; judge: <span className="mono">{data.judge}</span>.
      </div>
    </>
  );
};
