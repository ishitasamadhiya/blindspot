import { agentByVersion, newContext } from "./agent.js";
import { clusterVectors, distinguishingTokens } from "./cluster.js";
import { calibrateThreshold, computeCoverage, type CoverageSummary } from "./coverage.js";
import { claimTokens, type Embedder } from "./embed.js";
import { casePasses } from "./golden.js";
import type { Judge, JudgeVerdict } from "./judge.js";
import { selectRepresentatives, type Selection } from "./select.js";
import { bootstrapMeanCI, pairedBootstrapCI } from "./stats.js";
import { pca2d, type Vec } from "./vector.js";
import type { BlindSpot, CaseResult, EvalMetrics, EvalRun, GoldenCase, MapPoint, SegmentMetric, Trace } from "./types.js";

export interface CoverageAnalysis {
  window: { start: string; end: string };
  threshold: number;
  summary: CoverageSummary;
  blind_spots: BlindSpot[];
  map: MapPoint[];
  verdicts: Record<string, JudgeVerdict>;
  selections: Record<string, Selection>;
  embedder: string;
  judge: string;
  value_at_risk_total: number;
}

export function claimedAmount(trace: Trace): number {
  const c = trace.claim as unknown as Record<string, unknown>;
  if (typeof c.deduction_amt === "number") return c.deduction_amt;
  if (typeof c.requested_amt === "number") return c.requested_amt;
  if (Array.isArray(c.line_items)) return (c.line_items as Array<{ deduction: number }>).reduce((s, li) => s + li.deduction, 0);
  return 0;
}

export function hasFailureSignal(trace: Trace): boolean {
  const zeroDollarApproval = trace.output.decision === "APPROVE" && trace.output.amount === 0;
  return trace.signals.overridden || trace.signals.escalated || !!trace.signals.tool_error || zeroDollarApproval;
}

export async function analyzeCoverage(input: {
  golden: GoldenCase[];
  traces: Trace[];
  embedder: Embedder;
  judge: Judge;
  windowStart: string;
  windowEnd: string;
  budgetPerCluster?: number;
  maxClusters?: number;
  seed?: number;
}): Promise<CoverageAnalysis> {
  const seed = input.seed ?? 42;
  const windowTraces = input.traces.filter((t) => t.received_at >= input.windowStart && t.received_at <= input.windowEnd);
  const goldenVecs = await input.embedder.embed(input.golden.map((g) => JSON.stringify(g.claim)));
  const traceVecs = await input.embedder.embed(windowTraces.map((t) => JSON.stringify(t.claim)));
  const threshold = calibrateThreshold(goldenVecs, { seed });
  const summary = computeCoverage(
    windowTraces.map((t, i) => ({ trace_id: t.trace_id, vec: traceVecs[i] as Vec })),
    input.golden.map((g, i) => ({ case_id: g.case_id, vec: goldenVecs[i] as Vec })),
    threshold,
  );
  const hitById = new Map(summary.hits.map((h) => [h.trace_id, h]));
  const uncoveredIdx = windowTraces.map((_, i) => i).filter((i) => !(hitById.get((windowTraces[i] as Trace).trace_id) as { covered: boolean }).covered);
  const uncoveredVecs = uncoveredIdx.map((i) => traceVecs[i] as Vec);

  const verdicts: Record<string, JudgeVerdict> = {};
  for (const i of uncoveredIdx) {
    const t = windowTraces[i] as Trace;
    verdicts[t.trace_id] = await input.judge.grade(t.claim, t.output);
  }

  const blind_spots: BlindSpot[] = [];
  const clusterOf = new Map<string, string>();
  if (uncoveredVecs.length >= 4) {
    const result = clusterVectors(uncoveredVecs, { seed });
    const goldenTokens = input.golden.map((g) => claimTokens(g.claim));
    for (let c = 0; c < result.k; c++) {
      const memberIdx = uncoveredIdx.filter((_, j) => result.assignments[j] === c);
      if (memberIdx.length === 0) continue;
      const members = memberIdx.map((i) => windowTraces[i] as Trace);
      const memberVecs = memberIdx.map((i) => traceVecs[i] as Vec);
      const tokens = distinguishingTokens(members.map((m) => claimTokens(m.claim)), goldenTokens, 3);
      const failing = members.filter(hasFailureSignal).length;
      const meanSim = members.reduce((s, m) => s + (hitById.get(m.trace_id) as { similarity: number }).similarity, 0) / members.length;
      const retailers: Record<string, number> = {};
      for (const m of members) retailers[(m.claim as { retailer: string }).retailer] = (retailers[(m.claim as { retailer: string }).retailer] ?? 0) + 1;
      const volume_share = members.length / Math.max(1, windowTraces.length);
      const failure_rate = failing / members.length;
      const novelty = Math.max(0, 1 - meanSim);
      const cluster_id = `bs-${c + 1}`;
      const medoid = selectRepresentatives(members.map((m, j) => ({ id: m.trace_id, vec: memberVecs[j] as Vec })), { budget: 1 });
      blind_spots.push({
        cluster_id,
        name: tokens.join(" · ") || `cluster ${c + 1}`,
        tokens,
        trace_ids: members.map((m) => m.trace_id),
        volume: members.length,
        volume_share,
        failure_rate,
        novelty,
        score: volume_share * (0.25 + failure_rate) * novelty,
        value_at_risk: members.reduce((s, m) => s + claimedAmount(m), 0),
        retailers,
        medoid_trace_id: medoid.ids[0] ?? (members[0] as Trace).trace_id,
      });
      for (const m of members) clusterOf.set(m.trace_id, cluster_id);
    }
  }
  blind_spots.sort((a, b) => b.score - a.score);
  blind_spots.forEach((b, i) => {
    const rank = i + 1;
    const members = b.trace_ids;
    const id = `bs-${rank}`;
    for (const t of members) clusterOf.set(t, id);
    b.cluster_id = id;
  });

  const selections: Record<string, Selection> = {};
  const budget = input.budgetPerCluster ?? 10;
  const maxClusters = input.maxClusters ?? 3;
  for (const b of blind_spots.slice(0, maxClusters)) {
    const candidates = b.trace_ids.map((id) => {
      const i = windowTraces.findIndex((t) => t.trace_id === id);
      const t = windowTraces[i] as Trace;
      const v = verdicts[id];
      return { id, vec: traceVecs[i] as Vec, judge_confidence: v?.confidence, judge_disagrees: v ? !v.pass : false, failing: hasFailureSignal(t) };
    });
    selections[b.cluster_id] = selectRepresentatives(candidates, { budget, seed });
  }

  const allVecs = [...goldenVecs, ...traceVecs];
  const coords = pca2d(allVecs, seed);
  const map: MapPoint[] = [];
  input.golden.forEach((g, i) => map.push({ id: g.case_id, kind: "golden", x: (coords[i] as [number, number])[0], y: (coords[i] as [number, number])[1] }));
  windowTraces.forEach((t, i) => {
    const h = hitById.get(t.trace_id) as { covered: boolean };
    const c = coords[goldenVecs.length + i] as [number, number];
    map.push({ id: t.trace_id, kind: h.covered ? "covered" : "uncovered", x: c[0], y: c[1], ...(clusterOf.has(t.trace_id) ? { cluster_id: clusterOf.get(t.trace_id) as string } : {}) });
  });

  return {
    window: { start: input.windowStart, end: input.windowEnd },
    threshold,
    summary,
    blind_spots,
    map,
    verdicts,
    selections,
    embedder: input.embedder.name,
    judge: input.judge.name,
    value_at_risk_total: blind_spots.reduce((s, b) => s + b.value_at_risk, 0),
  };
}

function segment(results: CaseResult[], keyOf: (r: CaseResult) => string | undefined, labelOf: (k: string) => string): SegmentMetric[] {
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
  const passes = results.map((r) => (r.pass ? 1 : 0));
  const accuracy = bootstrapMeanCI(passes, { seed: input.seed ?? 0 });
  const clusterNames = new Map<string, string>();
  for (const g of input.golden) if (g.cluster_id && g.cluster_name) clusterNames.set(g.cluster_id, g.cluster_name);
  const metrics: EvalMetrics = {
    n: results.length,
    accuracy,
    by_cluster: segment(results, (r) => r.cluster_id, (k) => clusterNames.get(k) ?? k),
    by_retailer: segment(results, (r) => (byId.get(r.case_id)?.claim as { retailer: string } | undefined)?.retailer, (k) => k),
    by_source: segment(results, (r) => byId.get(r.case_id)?.source, (k) => k),
  };
  if (input.baseline?.metrics) {
    const basePass = new Map(input.baseline.results.map((r) => [r.case_id, r.pass ? 1 : 0]));
    const shared = results.filter((r) => basePass.has(r.case_id));
    if (shared.length >= 2) {
      const a = shared.map((r) => (r.pass ? 1 : 0));
      const b = shared.map((r) => basePass.get(r.case_id) as number);
      metrics.delta_vs_baseline = { ...pairedBootstrapCI(a, b, { seed: input.seed ?? 0 }), baseline_run_id: input.baseline.run_id };
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
