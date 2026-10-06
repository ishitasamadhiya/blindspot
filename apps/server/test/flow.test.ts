import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, createContext, type AppContext } from "../src/app.js";

let ctx: AppContext;
let app: Awaited<ReturnType<typeof buildApp>>;

async function waitJob(jobId: string) {
  return ctx.runner.wait(jobId);
}

beforeAll(async () => {
  ctx = createContext(":memory:", {});
  ctx.svc.seedDemo({ days: 7, baseline: false });
  app = await buildApp(ctx, { serveWeb: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("the whole loop over the REST API", () => {
  it("seeds a golden version and the first week of traffic", async () => {
    const res = await app.inject({ method: "GET", url: "/api/overview" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.golden.current).toBe("v1");
    expect(body.traffic.total).toBeGreaterThan(800);
    expect(body.traffic.replay.pending).toBeGreaterThan(900);
  });

  it("replays the rest of the traffic and finds blind spots from content", { timeout: 120_000 }, async () => {
    const replay = await app.inject({ method: "POST", url: "/api/demo/replay", payload: { instant: true } });
    expect(replay.json().started).toBe(true);
    const start = await app.inject({ method: "POST", url: "/api/coverage/run", payload: { window_days: 7 } });
    const job = await waitJob(start.json().job_id);
    expect(job.status).toBe("complete");
    expect(job.steps.every((s) => s.status === "done")).toBe(true);
    const latest = (await app.inject({ method: "GET", url: "/api/coverage/latest" })).json();
    expect(latest.coverage).toBeLessThan(0.7);
    expect(latest.analysis.blind_spots.length).toBeGreaterThanOrEqual(3);
    const names = latest.analysis.blind_spots.map((b: { name: string }) => b.name).join(" ");
    expect(names).toContain("line_items");
    expect(names).toContain("coop_program");
    expect(latest.analysis.map.length).toBe(latest.total + 400);
  });

  it("harvests, grades, commits v2 and blocks the old release on it", { timeout: 180_000 }, async () => {
    const harvested = (await app.inject({ method: "POST", url: "/api/harvest", payload: {} })).json();
    expect(harvested.length).toBe(30);
    const queue = (await app.inject({ method: "GET", url: "/api/grading/queue?status=pending" })).json();
    // grade one case by hand the way an analyst would: with the decision the analyst actually recorded on the trace
    const first = queue.find((q: { trace: { signals: { analyst_decision?: string } } }) => q.trace.signals.analyst_decision);
    const manual = await app.inject({
      method: "POST",
      url: `/api/grading/${first.item_id}`,
      payload: { decision: first.trace.signals.analyst_decision, amount: first.trace.signals.analyst_amount ?? 0, grader: "test" },
    });
    expect(manual.json().status).toBe("graded");
    const sim = (await app.inject({ method: "POST", url: "/api/demo/simulate-analyst", payload: {} })).json();
    expect(sim.graded).toBe(29);
    const agreement = (await app.inject({ method: "GET", url: "/api/grading/agreement" })).json();
    expect(agreement.length).toBe(3);
    for (const row of agreement) expect(row.graded).toBe(10);
    const v2 = (await app.inject({ method: "POST", url: "/api/golden/commit", payload: {} })).json();
    expect(v2.version).toBe("v2");
    expect(v2.case_ids.length).toBe(430);
    const again = await app.inject({ method: "POST", url: "/api/golden/commit", payload: {} });
    expect(again.statusCode).toBe(400);
    const exportRes = await app.inject({ method: "GET", url: "/api/golden/v2/export.jsonl" });
    const rows = exportRes.body.trim().split("\n");
    expect(rows.length).toBe(430);
    expect(Object.keys(JSON.parse(rows[0] as string)).sort()).toEqual(["context", "ground_truth", "query", "response"]);

    const covJob = ctx.svc.coverageJobInFlight("v2");
    if (covJob) await waitJob(covJob.job_id);
    const r13 = await app.inject({ method: "POST", url: "/api/eval/run", payload: { golden_version: "v2", agent_version: "1.3.0" } });
    const j13 = await waitJob(r13.json().job_id);
    const run13 = (j13.input as { run_id: string }).run_id;
    const gate13 = (await app.inject({ method: "GET", url: `/api/gate/${run13}` })).json();
    expect(gate13.status).toBe("BLOCKED");
    expect(gate13.checks.filter((c: { pass: boolean }) => !c.pass).length).toBeGreaterThanOrEqual(3);

    const r14 = await app.inject({ method: "POST", url: "/api/eval/run", payload: { golden_version: "v2", agent_version: "1.4.0", baseline_run_id: run13 } });
    const j14 = await waitJob(r14.json().job_id);
    const run14 = (j14.input as { run_id: string }).run_id;
    const detail = (await app.inject({ method: "GET", url: `/api/eval/runs/${run14}` })).json();
    expect(detail.metrics.delta_vs_baseline.lo).toBeGreaterThan(0);
    expect(detail.gate.status).toBe("PASS");
    expect(detail.gate.checks.find((c: { name: string }) => c.name.startsWith("no regression")).name).toContain("release/1.3 on v2");
  });

  it("rejects malformed trace ingestion and accepts a valid batch", async () => {
    const bad = await app.inject({ method: "POST", url: "/api/traces", payload: [{ trace_id: "x" }] });
    expect(bad.statusCode).toBe(400);
    const sample = ctx.svc.traces({ limit: 1 })[0]!;
    const ok = await app.inject({ method: "POST", url: "/api/traces", payload: [{ ...sample, trace_id: "T-NEW-1", received_at: new Date().toISOString() }] });
    expect(ok.json().ingested).toBe(1);
    expect(ctx.svc.trace("T-NEW-1")?.signals.overridden).toBe(false);
  });
});
