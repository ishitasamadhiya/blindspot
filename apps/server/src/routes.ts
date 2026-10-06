import type { FastifyInstance } from "fastify";
import type { Decision, Trace } from "@blindspot/core";
import type { EventBus } from "./events.js";
import type { JobRunner } from "./jobs.js";
import type { Services } from "./services.js";

export function registerRoutes(app: FastifyInstance, svc: Services, runner: JobRunner, bus: EventBus): void {
  app.get("/api/health", async () => ({ ok: true, seeded: svc.isSeeded(), embedder: svc.embedder.name, judge: svc.judge.name }));

  app.get("/api/overview", async () => svc.overview());

  app.get("/api/events", async (req, reply) => {
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    });
    reply.raw.write(`event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    const unsubscribe = bus.subscribe(reply);
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 15000);
    req.raw.on("close", () => {
      clearInterval(ping);
      unsubscribe();
    });
    await new Promise(() => {});
  });

  // traffic
  app.get<{ Querystring: { days?: string; limit?: string } }>("/api/traces", async (req) => {
    const days = Number(req.query.days ?? 7);
    const latest = svc.latestTraceAt();
    const since = latest ? new Date(Date.parse(latest) - days * 86_400_000).toISOString() : undefined;
    return svc.traces({ ...(since ? { since } : {}), limit: Number(req.query.limit ?? 500) });
  });
  app.get<{ Params: { id: string } }>("/api/traces/:id", async (req, reply) => {
    const t = svc.trace(req.params.id);
    if (!t) return reply.code(404).send({ error: "unknown trace" });
    const cov = svc.latestCoverageRun();
    const hit = cov?.analysis.hits.find((h) => h.trace_id === t.trace_id) ?? null;
    const verdict = cov?.analysis.verdicts[t.trace_id] ?? null;
    return { trace: t, coverage: hit, judge: verdict };
  });
  app.post<{ Body: Trace[] | { traces: Trace[] } }>("/api/traces", async (req, reply) => {
    const body = Array.isArray(req.body) ? req.body : req.body?.traces;
    if (!Array.isArray(body) || body.length === 0) return reply.code(400).send({ error: "send a JSON array of traces" });
    try {
      return svc.ingestTraces(body);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.post<{ Body: { seconds?: number; instant?: boolean } }>("/api/demo/replay", async (req) => svc.replay(req.body ?? {}));
  app.post<{ Body: { days?: number } }>("/api/demo/reset", async (req) => svc.seedDemo({ days: req.body?.days ?? 7 }));

  // coverage and blind spots
  app.post<{ Body: { window_days?: number; golden_version?: string; budget?: number; max_clusters?: number } }>("/api/coverage/run", async (req) => svc.startCoverage(req.body ?? {}));
  app.get("/api/coverage/runs", async () => svc.coverageRuns());
  app.get("/api/coverage/latest", async (req, reply) => {
    const run = svc.latestCoverageRun();
    if (!run) return reply.code(404).send({ error: "no coverage run yet" });
    const { verdicts: _v, ...rest } = run.analysis;
    return { ...run, analysis: rest };
  });
  app.get<{ Params: { id: string } }>("/api/coverage/runs/:id", async (req, reply) => {
    const run = svc.coverageRun(req.params.id);
    if (!run) return reply.code(404).send({ error: "unknown run" });
    const { verdicts: _v, ...rest } = run.analysis;
    return { ...run, analysis: rest };
  });
  app.get("/api/blindspots", async (req, reply) => {
    const run = svc.latestCoverageRun();
    if (!run) return reply.code(404).send({ error: "no coverage run yet" });
    return run.analysis.blind_spots.map((b) => ({
      ...b,
      examples: b.trace_ids.slice(0, 3).map((id) => svc.trace(id)),
      medoid: svc.trace(b.medoid_trace_id),
      selection: run.analysis.selections[b.cluster_id] ?? null,
    }));
  });

  // grading
  app.post<{ Body: { coverage_run_id?: string; cluster_ids?: string[] } }>("/api/harvest", async (req, reply) => {
    try {
      return svc.harvest(req.body ?? {});
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get<{ Querystring: { status?: "pending" | "graded" } }>("/api/grading/queue", async (req) => svc.gradingQueue({ ...(req.query.status ? { status: req.query.status } : {}) }));
  app.get("/api/grading/agreement", async () => svc.agreement());
  app.post<{ Params: { id: string }; Body: { decision: Decision; amount: number; note?: string; grader?: string } }>("/api/grading/:id", async (req, reply) => {
    try {
      return svc.gradeItem(req.params.id, req.body);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.post<{ Body: { delay_ms?: number; grader?: string } }>("/api/demo/simulate-analyst", async (req) => svc.simulateAnalyst(req.body ?? {}));

  // golden sets
  app.get("/api/golden/versions", async () => svc.goldenVersions());
  app.get<{ Params: { v: string } }>("/api/golden/:v", async (req, reply) => {
    try {
      return svc.goldenCases(req.params.v);
    } catch {
      return reply.code(404).send({ error: "unknown version" });
    }
  });
  app.get<{ Querystring: { from: string; to: string } }>("/api/golden/diff", async (req, reply) => {
    try {
      return svc.goldenDiff(req.query.from, req.query.to);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get<{ Params: { v: string } }>("/api/golden/:v/export.jsonl", async (req, reply) => {
    try {
      reply.header("content-type", "application/x-ndjson");
      reply.header("content-disposition", `attachment; filename="contoso-claims-${req.params.v}.jsonl"`);
      return svc.exportFoundry(req.params.v);
    } catch {
      return reply.code(404).send({ error: "unknown version" });
    }
  });
  app.post<{ Body: { note?: string } }>("/api/golden/commit", async (req, reply) => {
    try {
      return svc.commitGolden(req.body ?? {});
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // evaluation and gate
  app.get("/api/agent/versions", async () => svc.agentVersions());
  app.post<{ Body: { golden_version?: string; agent_version: string; baseline_run_id?: string; release_tag?: string } }>("/api/eval/run", async (req, reply) => {
    try {
      return svc.startEval(req.body);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get("/api/eval/runs", async () => svc.evalRuns().map((r) => ({ ...r, results: undefined, n: r.results.length, gate: svc.gate(r.run_id) ?? null })));
  app.get<{ Params: { id: string } }>("/api/eval/runs/:id", async (req, reply) => {
    const run = svc.evalRun(req.params.id);
    if (!run) return reply.code(404).send({ error: "unknown run" });
    return { ...run, gate: svc.gate(run.run_id) ?? null };
  });
  app.get("/api/gate/latest", async (req, reply) => {
    const g = svc.latestGate();
    if (!g) return reply.code(404).send({ error: "no gate evaluated yet" });
    return g;
  });
  app.get<{ Params: { id: string } }>("/api/gate/:id", async (req, reply) => {
    const g = svc.gate(req.params.id);
    if (!g) return reply.code(404).send({ error: "no gate for run" });
    return g;
  });

  // jobs
  app.get("/api/jobs", async () => runner.list());
  app.get<{ Params: { id: string } }>("/api/jobs/:id", async (req, reply) => runner.get(req.params.id) ?? reply.code(404).send({ error: "unknown job" }));
  app.post<{ Params: { id: string } }>("/api/jobs/:id/retry", async (req, reply) => runner.retry(req.params.id) ?? reply.code(404).send({ error: "unknown job" }));
}
