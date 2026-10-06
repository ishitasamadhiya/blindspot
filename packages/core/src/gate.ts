import type { EvalRun, GateCheck, GateResult } from "./types.js";

export interface GatePolicy {
  min_coverage: number;
  min_cluster_pass_rate: number;
  min_cluster_n: number;
  min_accuracy: number;
  regression_tolerance: number;
}

export const DEFAULT_GATE_POLICY: GatePolicy = {
  min_coverage: 0.85,
  min_cluster_pass_rate: 0.8,
  min_cluster_n: 8,
  min_accuracy: 0.85,
  regression_tolerance: 0.01,
};

export interface GateInput {
  run: EvalRun;
  coverage: number | null;
  policy?: Partial<GatePolicy>;
  evaluated_at: string;
}

export function evaluateGate(input: GateInput): GateResult {
  const policy = { ...DEFAULT_GATE_POLICY, ...(input.policy ?? {}) };
  const { run } = input;
  const checks: GateCheck[] = [];
  const m = run.metrics;

  checks.push({
    name: "coverage of last 7 days",
    pass: input.coverage !== null && input.coverage >= policy.min_coverage,
    value: input.coverage,
    threshold: policy.min_coverage,
    detail:
      input.coverage === null
        ? "no coverage run for this golden version"
        : `${pct(input.coverage)} of last-7-day traffic is within the golden set's own neighbourhood`,
  });

  checks.push({
    name: "overall accuracy",
    pass: !!m && m.accuracy.estimate >= policy.min_accuracy,
    value: m ? m.accuracy.estimate : null,
    threshold: policy.min_accuracy,
    detail: m ? `${pct(m.accuracy.estimate)} [${pct(m.accuracy.lo)}, ${pct(m.accuracy.hi)}] on ${m.n} cases` : "run has no metrics",
  });

  const harvested = (m?.by_cluster ?? []).filter((s) => s.n >= policy.min_cluster_n);
  for (const seg of harvested) {
    checks.push({
      name: `blind spot: ${seg.label}`,
      pass: seg.pass_rate >= policy.min_cluster_pass_rate,
      value: seg.pass_rate,
      threshold: policy.min_cluster_pass_rate,
      detail: `${pct(seg.pass_rate)} pass on ${seg.n} harvested cases`,
    });
  }

  if (m?.delta_vs_baseline) {
    const d = m.delta_vs_baseline;
    checks.push({
      name: `no regression vs ${run.baseline_run_id ?? "baseline"}`,
      pass: d.hi >= -policy.regression_tolerance,
      value: d.estimate,
      threshold: -policy.regression_tolerance,
      detail: `paired delta ${signed(d.estimate)} [${signed(d.lo)}, ${signed(d.hi)}] over ${d.n_boot.toLocaleString()} resamples${d.lo <= 0 && d.hi >= 0 ? "; interval includes zero" : ""}`,
    });
  }

  const status = run.status === "complete" && checks.every((c) => c.pass) ? "PASS" : "BLOCKED";
  if (run.status !== "complete") {
    checks.unshift({ name: "eval run complete", pass: false, value: null, threshold: 1, detail: `run status is ${run.status}; a partial run never passes` });
  }
  return { run_id: run.run_id, status, checks, evaluated_at: input.evaluated_at };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
function signed(x: number): string {
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} pts`;
}
