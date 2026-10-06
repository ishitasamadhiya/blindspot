import { agentByVersion, newContext } from "./agent.js";
import { casePasses } from "./golden.js";
import { bootstrapMeanCI, pairedBootstrapCI } from "./stats.js";
import type { CaseResult, EvalMetrics, EvalRun, GoldenCase, SegmentMetric } from "./types.js";

export function segmentResults(results: CaseResult[], keyOf: (r: CaseResult) => string | undefined, labelOf: (k: string) => string): SegmentMetric[] {
  const groups = new Map<string, CaseResult[]>();
  for (const r of results) {
    const k = keyOf(r);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    (groups.get(k) as CaseResult[]).push(r);
  }
  return Array.from(groups.entries())
    .map(([key, rs]) => ({ key, label: labelOf(key), n: rs.length, pass_rate: rs.filter((r) => r.pass).length / rs.length }))
    .sort((a, b) => b.n - a.n);
}

/** In-process evaluation of one agent release over one golden version: replay in submission order, aggregate with bootstrap intervals. */
export function runEvaluation(input: {
  run_id: string;
  created_at: string;
  golden: GoldenCase[];
  golden_version: string;
  agent_version: string;
  release_tag: string;
  baseline?: EvalRun;
  seed?: number;
}): EvalRun {
  const agent = agentByVersion(input.agent_version);
  const ctx = newContext();
  const ordered = input.golden.slice().sort((a, b) => ((a.claim as { submitted_at: string }).submitted_at < (b.claim as { submitted_at: string }).submitted_at ? -1 : 1));
  const results: CaseResult[] = ordered.map((g) => {
    const output = agent.run(g.claim, ctx);
    return { case_id: g.case_id, output, pass: casePasses(g.expected, output), ...(g.cluster_id ? { cluster_id: g.cluster_id } : {}) };
  });
  const byId = new Map(input.golden.map((g) => [g.case_id, g]));
  const clusterNames = new Map<string, string>();
  for (const g of input.golden) if (g.cluster_id && g.cluster_name) clusterNames.set(g.cluster_id, g.cluster_name);
  const metrics: EvalMetrics = {
    n: results.length,
    accuracy: bootstrapMeanCI(results.map((r) => (r.pass ? 1 : 0)), { seed: input.seed ?? 0 }),
    by_cluster: segmentResults(results, (r) => r.cluster_id, (k) => clusterNames.get(k) ?? k),
    by_retailer: segmentResults(results, (r) => (byId.get(r.case_id)?.claim as { retailer: string } | undefined)?.retailer, (k) => k),
    by_source: segmentResults(results, (r) => byId.get(r.case_id)?.source, (k) => k),
  };
  if (input.baseline?.metrics) {
    const basePass = new Map(input.baseline.results.map((r) => [r.case_id, r.pass ? 1 : 0]));
    const shared = results.filter((r) => basePass.has(r.case_id));
    if (shared.length >= 2) {
      metrics.delta_vs_baseline = { ...pairedBootstrapCI(shared.map((r) => (r.pass ? 1 : 0)), shared.map((r) => basePass.get(r.case_id) as number), { seed: input.seed ?? 0 }), baseline_run_id: input.baseline.run_id };
    }
  }
  return {
    run_id: input.run_id,
    created_at: input.created_at,
    golden_version: input.golden_version,
    agent_version: input.agent_version,
    release_tag: input.release_tag,
    ...(input.baseline ? { baseline_run_id: input.baseline.run_id } : {}),
    status: "complete",
    results,
    metrics,
  };
}
