import { describe, expect, it } from "vitest";
import { AGENT_VERSIONS, casePasses, evaluateGate, generateSeed, runAgent, runEvaluation, type EvalRun, type PortalV2Claim } from "../src/index.js";

describe("agent under test", () => {
  it("release 1.3 approves a portal-v2 claim for zero dollars because it cannot find the amount", () => {
    const seed = generateSeed(3);
    const v2 = seed.traces.find((t) => seed.formats[t.trace_id] === "portal-v2" && seed.truth[t.trace_id]!.decision === "APPROVE")!;
    const [out13] = runAgent("1.3.0", [v2.claim]);
    expect(out13!.decision).toBe("APPROVE");
    expect(out13!.amount).toBe(0);
    const [out14] = runAgent("1.4.0", [v2.claim]);
    const claimed = (v2.claim as PortalV2Claim).line_items.reduce((s, li) => s + li.deduction, 0);
    expect(out14!.decision).toBe("APPROVE");
    expect(out14!.amount).toBeGreaterThan(0);
    expect(Math.abs(out14!.amount - claimed) <= Math.max(1, claimed * 0.26)).toBe(true);
  });
  it("release 1.3 scores above 90% on the golden set it was built from", () => {
    const seed = generateSeed(42);
    const run = runEvaluation({ run_id: "r", created_at: "2026-10-06T00:00:00Z", golden: seed.golden, golden_version: "v1", agent_version: "1.3.0", release_tag: "release/1.3" });
    expect(run.metrics!.accuracy.estimate).toBeGreaterThan(0.9);
    expect(run.metrics!.accuracy.lo).toBeLessThan(run.metrics!.accuracy.estimate);
  });
  it("every release has a distinct behaviour on at least one claim", () => {
    const seed = generateSeed(42);
    const claims = seed.traces.map((t) => t.claim);
    const outs = AGENT_VERSIONS.map((v) => runAgent(v.version, claims).map((o) => `${o.decision}:${o.amount}`).join("|"));
    expect(new Set(outs).size).toBe(AGENT_VERSIONS.length);
  });
  it("casePasses tolerates one percent on approved amounts", () => {
    expect(casePasses({ decision: "APPROVE", amount: 1000 }, { decision: "APPROVE", amount: 1009, reason: "" })).toBe(true);
    expect(casePasses({ decision: "APPROVE", amount: 1000 }, { decision: "APPROVE", amount: 1020, reason: "" })).toBe(false);
    expect(casePasses({ decision: "REJECT", amount: 0 }, { decision: "APPROVE", amount: 0, reason: "" })).toBe(false);
  });
});

describe("gate", () => {
  const base = (over: Partial<EvalRun>): EvalRun => ({
    run_id: "run-1",
    created_at: "2026-10-06T00:00:00Z",
    golden_version: "v2",
    agent_version: "1.4.0",
    release_tag: "release/1.4",
    status: "complete",
    results: [],
    metrics: {
      n: 430,
      accuracy: { estimate: 0.93, lo: 0.9, hi: 0.95, n: 430, n_boot: 10000 },
      by_cluster: [{ key: "bs-1", label: "line_items", n: 10, pass_rate: 0.9 }],
      by_retailer: [],
      by_source: [],
    },
    ...over,
  });
  it("blocks on low coverage and on a failing harvested cluster", () => {
    const r = base({});
    expect(evaluateGate({ run: r, coverage: 0.61, evaluated_at: "x" }).status).toBe("BLOCKED");
    const failing = base({ metrics: { ...r.metrics!, by_cluster: [{ key: "bs-1", label: "line_items", n: 10, pass_rate: 0.2 }] } });
    expect(evaluateGate({ run: failing, coverage: 0.9, evaluated_at: "x" }).status).toBe("BLOCKED");
    expect(evaluateGate({ run: r, coverage: 0.9, evaluated_at: "x" }).status).toBe("PASS");
  });
  it("ignores a small negative delta whose interval includes zero but blocks a real regression", () => {
    const r = base({});
    const noisy = base({ metrics: { ...r.metrics!, delta_vs_baseline: { estimate: -0.014, lo: -0.04, hi: 0.01, n: 430, n_boot: 10000, baseline_run_id: "run-0" } } });
    expect(evaluateGate({ run: noisy, coverage: 0.9, evaluated_at: "x" }).status).toBe("PASS");
    const real = base({ metrics: { ...r.metrics!, delta_vs_baseline: { estimate: -0.06, lo: -0.09, hi: -0.03, n: 430, n_boot: 10000, baseline_run_id: "run-0" } } });
    expect(evaluateGate({ run: real, coverage: 0.9, evaluated_at: "x" }).status).toBe("BLOCKED");
  });
  it("never passes a partial run", () => {
    expect(evaluateGate({ run: base({ status: "partial" }), coverage: 0.95, evaluated_at: "x" }).status).toBe("BLOCKED");
  });
});
