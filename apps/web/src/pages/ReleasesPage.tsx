import React, { useEffect, useState } from "react";
import type { EvalMetrics, EvalRun, GateResult, GoldenVersion } from "@blindspot/core";
import { api, useApi } from "../lib/api";
import { pct, pts, dateTime } from "../lib/format";
import { GateBanner, GateChecks } from "../components/Gate";
import { IntervalBar } from "../components/Interval";
import { SegmentBars } from "../components/SegmentBars";
import { Patch } from "../components/Patch";
import { JobPipeline, type JobView } from "../components/JobPipeline";
import { useToast } from "../components/Toasts";

interface RunRow {
  run_id: string;
  created_at: string;
  golden_version: string;
  agent_version: string;
  release_tag: string;
  baseline_run_id: string | null;
  status: EvalRun["status"];
  n: number;
  metrics?: EvalMetrics;
  gate: (GateResult & { coverage: number | null }) | null;
}
interface AgentVersion {
  version: string;
  release_tag: string;
  summary: string;
  patch: string;
}

export const ReleasesPage: React.FC = () => {
  const runs = useApi<RunRow[]>("/api/eval/runs", ["eval", "gate", "job"]);
  const versions = useApi<GoldenVersion[]>("/api/golden/versions", ["golden"]);
  const agents = useApi<AgentVersion[]>("/api/agent/versions", []);
  const jobs = useApi<JobView[]>("/api/jobs", ["job"]);
  const overview = useApi<{ golden: { current: string } }>("/api/overview", ["golden"]);
  const toast = useToast();
  const [goldenV, setGoldenV] = useState<string>("");
  const [agentV, setAgentV] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!goldenV && overview.data) setGoldenV(overview.data.golden.current);
  }, [overview.data, goldenV]);
  useEffect(() => {
    if (!agentV && agents.data?.length) setAgentV(agents.data[0]?.version ?? "");
  }, [agents.data, agentV]);
  const run = (runs.data ?? []).find((r) => r.run_id === selected) ?? runs.data?.[0] ?? null;
  const agent = agents.data?.find((a) => a.version === agentV) ?? null;
  const activeJob = (jobs.data ?? []).find((j) => j.type === "eval" && (j.status === "running" || j.status === "queued")) ?? null;
  const start = async () => {
    setBusy(true);
    try {
      await api("/api/eval/run", { method: "POST", json: { golden_version: goldenV, agent_version: agentV } });
      toast(`Evaluating ${agent?.release_tag ?? agentV} on ${goldenV}`);
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const m = run?.metrics ?? null;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Block the release</h1>
          <p>A release ships only if the eval it passed is about this week's traffic: coverage of the last 7 days at or above 85%, no harvested blind spot below 80%, overall accuracy at or above 85%, and no paired-bootstrap regression against the previous run.</p>
        </div>
      </div>
      <div className="grid side">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {run && run.gate ? <GateBanner gate={run.gate} title={`${run.release_tag} on golden ${run.golden_version}${run.gate.coverage !== null ? ` · coverage ${pct(run.gate.coverage)}` : ""}`} /> : null}
          {activeJob ? (
            <div className="card">
              <JobPipeline job={activeJob} />
            </div>
          ) : null}
          {run && m ? (
            <div className="card">
              <div className="card-head">
                <h2>
                  {run.release_tag} <span className="faint">agent {run.agent_version} · golden {run.golden_version} · {run.n} cases · {dateTime(run.created_at)}</span>
                </h2>
                <span className={`badge ${run.status === "complete" ? "pass" : "warn"}`}>{run.status}</span>
              </div>
              <div className="grid cols-2">
                <div>
                  <div className="small muted" style={{ marginBottom: 6 }}>
                    Accuracy
                  </div>
                  <IntervalBar interval={m.accuracy} min={0.8} max={1} tone={m.accuracy.estimate >= 0.9 ? "success" : "danger"} />
                </div>
                <div>
                  <div className="small muted" style={{ marginBottom: 6 }}>
                    {m.delta_vs_baseline ? `Paired delta vs ${runs.data?.find((r) => r.run_id === m.delta_vs_baseline?.baseline_run_id)?.release_tag ?? "baseline"} on the same cases` : "No baseline on this golden version"}
                  </div>
                  {m.delta_vs_baseline ? (
                    <>
                      <IntervalBar interval={m.delta_vs_baseline} min={-0.1} max={0.1} zero format="pts" tone={m.delta_vs_baseline.hi < -0.01 ? "danger" : m.delta_vs_baseline.lo > 0 ? "success" : "accent"} />
                      <div className="small muted" style={{ marginTop: 6 }}>
                        {m.delta_vs_baseline.lo <= 0 && m.delta_vs_baseline.hi >= 0 ? `The interval includes zero: a ${pts(m.delta_vs_baseline.estimate)} move is noise at this sample size, so the gate does not fire.` : m.delta_vs_baseline.lo > 0 ? "A real improvement: the whole interval is above zero." : "A real regression: the whole interval is below zero."}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="grid cols-2 section">
                <div>
                  <div className="small muted" style={{ marginBottom: 6 }}>
                    By blind spot (harvested cases)
                  </div>
                  <SegmentBars segments={m.by_cluster} emptyText="No harvested cases in this golden version." />
                </div>
                <div>
                  <div className="small muted" style={{ marginBottom: 6 }}>
                    By retailer
                  </div>
                  <SegmentBars segments={m.by_retailer} threshold={0.85} />
                </div>
              </div>
              {run.gate ? (
                <div className="section">
                  <div className="small muted" style={{ marginBottom: 6 }}>
                    Gate checks
                  </div>
                  <GateChecks gate={run.gate} />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="card empty">No evaluation yet. Pick a release and golden version on the right.</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div className="card-head">
              <h2>Evaluate a release</h2>
            </div>
            <div className="field">
              <label htmlFor="golden">Golden version</label>
              <select id="golden" value={goldenV} onChange={(e) => setGoldenV(e.target.value)}>
                {(versions.data ?? []).map((v) => (
                  <option key={v.version} value={v.version}>
                    {v.version} · {v.case_ids.length} cases{v.version === overview.data?.golden.current ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="agent">Release candidate</label>
              <select id="agent" value={agentV} onChange={(e) => setAgentV(e.target.value)}>
                {(agents.data ?? []).map((a) => (
                  <option key={a.version} value={a.version}>
                    {a.release_tag} · {a.summary.slice(0, 48)}
                  </option>
                ))}
              </select>
            </div>
            {agent ? <div className="small muted" style={{ marginTop: 8 }}>{agent.summary}</div> : null}
            {agent?.patch ? (
              <div style={{ marginTop: 10 }}>
                <Patch patch={agent.patch} />
              </div>
            ) : null}
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn primary" disabled={busy || !!activeJob || !goldenV || !agentV} onClick={() => void start()}>
                Run eval + gate
              </button>
              <span className="small faint">also: <span className="mono">npm run gate</span> exits non-zero when blocked</span>
            </div>
          </div>
          <div className="card flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th>run</th>
                  <th>golden</th>
                  <th className="num">accuracy</th>
                  <th>gate</th>
                </tr>
              </thead>
              <tbody>
                {(runs.data ?? []).map((r) => (
                  <tr key={r.run_id} className={`clickable ${run?.run_id === r.run_id ? "selected" : ""}`} tabIndex={0} role="button" aria-pressed={run?.run_id === r.run_id} onClick={() => setSelected(r.run_id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? (e.preventDefault(), setSelected(r.run_id)) : undefined)}>
                    <td>
                      <b>{r.release_tag}</b>
                      <div className="small faint">{dateTime(r.created_at)}</div>
                    </td>
                    <td className="small">{r.golden_version}</td>
                    <td className="num small">{r.metrics ? pct(r.metrics.accuracy.estimate) : r.status}</td>
                    <td>{r.gate ? <span className={`badge ${r.gate.status === "PASS" ? "pass" : "blocked"}`}>{r.gate.status}</span> : <span className="faint small">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};
