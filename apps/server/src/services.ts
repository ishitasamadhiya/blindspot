import {
  AGENT_VERSIONS,
  HashingEmbedder,
  SimulatedJudge,
  agentByVersion,
  agreementRate,
  bootstrapMeanCI,
  calibrateThreshold,
  canonicalDigest,
  casePasses,
  claimTokens,
  claimedAmount,
  clusterVectors,
  cohenKappa,
  computeCoverage,
  distinguishingTokens,
  evaluateGate,
  generateSeed,
  hasFailureSignal,
  newContext,
  layoutMap,
  pairedBootstrapCI,
  selectRepresentatives,
  toFoundryRows,
  type BlindSpot,
  type CaseResult,
  type CoverageHit,
  type Decision,
  type Embedder,
  type EvalMetrics,
  type EvalRun,
  type Expected,
  type GateResult,
  type GoldenCase,
  type GoldenVersion,
  type Judge,
  type JudgeVerdict,
  type MapPoint,
  type SegmentMetric,
  type Selection,
  type Trace,
} from "@blindspot/core";
import type { Db } from "./db.js";
import { getMeta, json, newId, nowIso, resetDb, setMeta } from "./db.js";
import type { EventBus } from "./events.js";
import type { JobRecord, JobRunner } from "./jobs.js";

export interface CoverageRunSummary {
  run_id: string;
  created_at: string;
  golden_version: string;
  window_start: string;
  window_end: string;
  embedder: string;
  judge: string;
  threshold: number;
  coverage: number;
  covered: number;
  total: number;
}

export interface CoverageAnalysisStored {
  hits: CoverageHit[];
  blind_spots: BlindSpot[];
  map: MapPoint[];
  verdicts: Record<string, JudgeVerdict>;
  selections: Record<string, Selection>;
  value_at_risk_total: number;
  trace_count: number;
  long_tail?: { clusters: number; traces: number; value: number; floor: number };
}

export interface GradingItem {
  item_id: string;
  coverage_run_id: string;
  cluster_id: string;
  cluster_name: string;
  trace_id: string;
  role: string;
  status: "pending" | "graded";
  judge: JudgeVerdict | null;
  expert: { decision: Decision; amount: number; note: string; grader: string; graded_at: string } | null;
  created_at: string;
  trace?: Trace;
}

export interface DailyStat {
  day: string;
  volume: number;
  overrides: number;
  escalations: number;
  zero_dollar_approvals: number;
}

const ENGAGEMENT = {
  customer: "Contoso Foods",
  agent: "Deduction-claim validator",
  description: "Validates retailer trade-promotion deduction claims (Northwind Traders, Fabrikam Grocers, Tailwind Markets) against Contoso's promo contracts and returns APPROVE / REJECT / ESCALATE with a reimbursable amount.",
  deployed: "2026-09-08",
  discovery_graders: ["analyst:m.okafor", "analyst:j.lindqvist"],
};

function vecToB64(v: Float32Array): string {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");
}
function b64ToVec(s: string): Float32Array {
  const b = Buffer.from(s, "base64");
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

export class Services {
  readonly embedder: Embedder;
  readonly judge: Judge;
  private replayTimer: NodeJS.Timeout | null = null;

  constructor(
    private db: Db,
    private bus: EventBus,
    private runner: JobRunner,
    opts: { embedder?: Embedder; judge?: Judge } = {},
  ) {
    this.embedder = opts.embedder ?? new HashingEmbedder();
    this.judge = opts.judge ?? new SimulatedJudge();
    this.registerJobs();
  }

  // ---------- seeding and traffic ----------

  isSeeded(): boolean {
    return !!getMeta(this.db, "seed");
  }

  seedDemo(opts: { days?: number; seed?: number; baseline?: boolean } = {}): { golden: number; traces: number; pending: number } {
    const days = opts.days ?? 7;
    const data = generateSeed(opts.seed ?? 42);
    resetDb(this.db);
    const cutoff = new Date(Date.parse("2026-09-23T00:00:00Z") + days * 86_400_000).toISOString();
    const insertGolden = this.db.prepare(
      "INSERT INTO golden_cases(case_id,version_added,claim,expected,source,cluster_id,cluster_name,graded_by,graded_at) VALUES (?,?,?,?,?,?,?,?,?)",
    );
    for (const g of data.golden) insertGolden.run(g.case_id, "v1", JSON.stringify(g.claim), JSON.stringify(g.expected), g.source, null, null, g.graded_by, g.graded_at);
    const v1: GoldenVersion = {
      version: "v1",
      created_at: "2026-08-28T17:10:00Z",
      case_ids: data.golden.map((g) => g.case_id),
      sha256: canonicalDigest(data.golden),
      note: "Discovery golden set: 400 historical claims from Jun–Aug 2026, replayed against analyst decisions and graded by two Contoso deductions analysts.",
    };
    this.db.prepare("INSERT INTO golden_versions(version,created_at,parent,case_ids,sha256,note) VALUES (?,?,?,?,?,?)").run(v1.version, v1.created_at, null, JSON.stringify(v1.case_ids), v1.sha256, v1.note);
    const insertTruth = this.db.prepare("INSERT INTO seed_truth(trace_id,expected,format) VALUES (?,?,?)");
    const insertPending = this.db.prepare("INSERT INTO seed_pending(trace_id,received_at,trace) VALUES (?,?,?)");
    let ingested = 0;
    let pending = 0;
    const live: Trace[] = [];
    for (const t of data.traces) {
      insertTruth.run(t.trace_id, JSON.stringify(data.truth[t.trace_id]), data.formats[t.trace_id] ?? "unknown");
      if (t.received_at < cutoff) {
        live.push(t);
        ingested++;
      } else {
        insertPending.run(t.trace_id, t.received_at, JSON.stringify(t));
        pending++;
      }
    }
    this.insertTraces(live, "2026-09-29T23:59:00Z");
    setMeta(this.db, "seed", String(opts.seed ?? 42));
    setMeta(this.db, "seed_days", String(days));
    setMeta(this.db, "current_golden_version", "v1");
    setMeta(this.db, "engagement", JSON.stringify(ENGAGEMENT));
    this.bus.emit("seeded", { golden: data.golden.length, traces: ingested, pending });
    if (opts.baseline !== false) {
      this.startEval({ golden_version: "v1", agent_version: "1.3.0" });
      this.startCoverage({ window_days: 7, golden_version: "v1" });
    }
    return { golden: data.golden.length, traces: ingested, pending };
  }

  private insertTraces(traces: Trace[], ingestedAt = nowIso()): void {
    const stmt = this.db.prepare("INSERT OR REPLACE INTO traces(trace_id,received_at,agent_version,claim,output,signals,ingested_at) VALUES (?,?,?,?,?,?,?)");
    for (const t of traces) stmt.run(t.trace_id, t.received_at, t.agent_version, JSON.stringify(t.claim), JSON.stringify(t.output), JSON.stringify(t.signals), ingestedAt);
  }

  ingestTraces(traces: Trace[]): { ingested: number } {
    for (const t of traces) {
      if (!t.trace_id || !t.received_at || !t.claim || !t.output) throw new Error("trace needs trace_id, received_at, claim and output");
      const given = (t.signals ?? {}) as Partial<Trace["signals"]>;
      t.signals = {
        overridden: given.overridden ?? false,
        escalated: given.escalated ?? t.output.decision === "ESCALATE",
        latency_ms: given.latency_ms ?? 0,
        ...(given.analyst_decision !== undefined ? { analyst_decision: given.analyst_decision } : {}),
        ...(given.analyst_amount !== undefined ? { analyst_amount: given.analyst_amount } : {}),
        ...(given.tool_error !== undefined ? { tool_error: given.tool_error } : {}),
      };
      t.agent_version = t.agent_version ?? "unknown";
    }
    this.insertTraces(traces);
    this.bus.emit("traces", { ingested: traces.length, latest: traces[traces.length - 1]?.received_at ?? null });
    return { ingested: traces.length };
  }

  pendingReplay(): { pending: number; from: string | null; to: string | null } {
    const row = this.db.prepare("SELECT COUNT(*) AS n, MIN(received_at) AS f, MAX(received_at) AS t FROM seed_pending").get() as { n: number; f: string | null; t: string | null };
    return { pending: row.n, from: row.f, to: row.t };
  }

  replay(opts: { seconds?: number; instant?: boolean } = {}): { started: boolean; pending: number } {
    const { pending } = this.pendingReplay();
    if (pending === 0 || this.replayTimer) return { started: false, pending };
    const rows = this.db.prepare("SELECT trace FROM seed_pending ORDER BY received_at").all() as Array<{ trace: string }>;
    const traces = rows.map((r) => json<Trace>(r.trace));
    const clear = this.db.prepare("DELETE FROM seed_pending WHERE trace_id = ?");
    if (opts.instant) {
      this.insertTraces(traces);
      for (const t of traces) clear.run(t.trace_id);
      this.bus.emit("traces", { ingested: traces.length, latest: traces[traces.length - 1]?.received_at ?? null, replay: "done" });
      return { started: true, pending };
    }
    const seconds = Math.max(2, opts.seconds ?? 18);
    const batches = Math.min(traces.length, Math.round(seconds * 8));
    const perBatch = Math.ceil(traces.length / batches);
    let i = 0;
    this.bus.emit("replay", { status: "started", total: traces.length });
    this.replayTimer = setInterval(() => {
      const batch = traces.slice(i, i + perBatch);
      i += perBatch;
      this.insertTraces(batch);
      for (const t of batch) clear.run(t.trace_id);
      this.bus.emit("traces", { ingested: batch.length, latest: batch[batch.length - 1]?.received_at ?? null, replay: i >= traces.length ? "done" : "running", remaining: Math.max(0, traces.length - i) });
      if (i >= traces.length && this.replayTimer) {
        clearInterval(this.replayTimer);
        this.replayTimer = null;
        this.bus.emit("replay", { status: "done", total: traces.length });
      }
    }, (seconds * 1000) / batches);
    return { started: true, pending };
  }

  traces(opts: { since?: string; until?: string; limit?: number } = {}): Trace[] {
    const rows = this.db
      .prepare("SELECT * FROM traces WHERE received_at >= ? AND received_at <= ? ORDER BY received_at DESC LIMIT ?")
      .all(opts.since ?? "0000", opts.until ?? "9999", opts.limit ?? 5000) as Array<Record<string, string>>;
    return rows.map(rowToTrace);
  }

  trace(traceId: string): Trace | undefined {
    const row = this.db.prepare("SELECT * FROM traces WHERE trace_id = ?").get(traceId) as Record<string, string> | undefined;
    return row ? rowToTrace(row) : undefined;
  }

  latestTraceAt(): string | null {
    const row = this.db.prepare("SELECT MAX(received_at) AS m FROM traces").get() as { m: string | null };
    return row.m;
  }

  dailyStats(): DailyStat[] {
    const rows = this.db.prepare("SELECT received_at, output, signals FROM traces ORDER BY received_at").all() as Array<Record<string, string>>;
    const byDay = new Map<string, DailyStat>();
    for (const r of rows) {
      const day = r.received_at!.slice(0, 10);
      const s = byDay.get(day) ?? { day, volume: 0, overrides: 0, escalations: 0, zero_dollar_approvals: 0 };
      const out = json<Trace["output"]>(r.output);
      const sig = json<Trace["signals"]>(r.signals);
      s.volume++;
      if (sig.overridden) s.overrides++;
      if (sig.escalated) s.escalations++;
      if (out.decision === "APPROVE" && out.amount === 0) s.zero_dollar_approvals++;
      byDay.set(day, s);
    }
    return Array.from(byDay.values());
  }

  // ---------- golden sets ----------

  currentGoldenVersion(): string {
    return getMeta(this.db, "current_golden_version") ?? "v1";
  }

  goldenVersions(): GoldenVersion[] {
    return (this.db.prepare("SELECT * FROM golden_versions ORDER BY created_at").all() as Array<Record<string, string>>).map((r) => ({
      version: r.version!,
      created_at: r.created_at!,
      ...(r.parent ? { parent: r.parent } : {}),
      case_ids: json<string[]>(r.case_ids),
      sha256: r.sha256!,
      note: r.note!,
    }));
  }

  goldenCases(version: string): GoldenCase[] {
    const v = this.goldenVersions().find((x) => x.version === version);
    if (!v) throw new Error(`unknown golden version ${version}`);
    const ids = new Set(v.case_ids);
    const rows = this.db.prepare("SELECT * FROM golden_cases").all() as Array<Record<string, string | null>>;
    return rows.filter((r) => ids.has(r.case_id as string)).map(rowToGoldenCase);
  }

  goldenDiff(from: string, to: string): { added: GoldenCase[]; removed: string[]; from: GoldenVersion; to: GoldenVersion } {
    const versions = this.goldenVersions();
    const a = versions.find((v) => v.version === from);
    const b = versions.find((v) => v.version === to);
    if (!a || !b) throw new Error("unknown version");
    const inA = new Set(a.case_ids);
    const inB = new Set(b.case_ids);
    const added = this.goldenCases(to).filter((c) => !inA.has(c.case_id));
    const removed = a.case_ids.filter((id) => !inB.has(id));
    return { added, removed, from: a, to: b };
  }

  exportFoundry(version: string): string {
    const cases = this.goldenCases(version);
    return toFoundryRows(cases)
      .map((r) => JSON.stringify(r))
      .join("\n");
  }

  commitGolden(opts: { note?: string; grader?: string } = {}): GoldenVersion {
    const current = this.currentGoldenVersion();
    const parent = this.goldenVersions().find((v) => v.version === current);
    if (!parent) throw new Error("no current golden version");
    const graded = this.gradingQueue({ status: "graded" }).filter((g) => !this.db.prepare("SELECT 1 FROM golden_cases WHERE case_id = ?").get(`H-${g.trace_id}`));
    if (graded.length === 0) throw new Error("nothing graded since the last commit");
    const n = parseInt(current.slice(1), 10) + 1;
    const version = `v${n}`;
    const insert = this.db.prepare("INSERT INTO golden_cases(case_id,version_added,claim,expected,source,cluster_id,cluster_name,graded_by,graded_at) VALUES (?,?,?,?,?,?,?,?,?)");
    const newCases: GoldenCase[] = [];
    for (const g of graded) {
      const t = this.trace(g.trace_id);
      if (!t || !g.expert) continue;
      const c: GoldenCase = {
        case_id: `H-${g.trace_id}`,
        claim: t.claim,
        expected: { decision: g.expert.decision, amount: g.expert.amount },
        source: "harvested",
        cluster_id: g.cluster_id,
        cluster_name: g.cluster_name,
        graded_by: g.expert.grader,
        graded_at: g.expert.graded_at,
      };
      insert.run(c.case_id, version, JSON.stringify(c.claim), JSON.stringify(c.expected), c.source, c.cluster_id ?? null, c.cluster_name ?? null, c.graded_by, c.graded_at);
      newCases.push(c);
    }
    const caseIds = [...parent.case_ids, ...newCases.map((c) => c.case_id)];
    const all = [...this.goldenCases(current), ...newCases];
    const clusters = new Map<string, number>();
    for (const c of newCases) clusters.set(c.cluster_name ?? "?", (clusters.get(c.cluster_name ?? "?") ?? 0) + 1);
    const v: GoldenVersion = {
      version,
      created_at: nowIso(),
      parent: current,
      case_ids: caseIds,
      sha256: canonicalDigest(all),
      note:
        opts.note ??
        `+${newCases.length} harvested cases from ${clusters.size} blind spot${clusters.size === 1 ? "" : "s"}: ${Array.from(clusters.entries())
          .map(([k, n]) => `${k} (${n})`)
          .join(", ")}.`,
    };
    this.db.prepare("INSERT INTO golden_versions(version,created_at,parent,case_ids,sha256,note) VALUES (?,?,?,?,?,?)").run(v.version, v.created_at, v.parent ?? null, JSON.stringify(v.case_ids), v.sha256, v.note);
    setMeta(this.db, "current_golden_version", version);
    this.bus.emit("golden", v);
    return v;
  }

  // ---------- coverage ----------

  coverageRuns(): CoverageRunSummary[] {
    return (this.db.prepare("SELECT run_id,created_at,golden_version,window_start,window_end,embedder,judge,threshold,coverage,covered,total FROM coverage_runs ORDER BY created_at DESC").all() as unknown) as CoverageRunSummary[];
  }

  coverageRun(runId: string): (CoverageRunSummary & { analysis: CoverageAnalysisStored }) | undefined {
    const row = this.db.prepare("SELECT * FROM coverage_runs WHERE run_id = ?").get(runId) as (CoverageRunSummary & { analysis: string }) | undefined;
    if (!row) return undefined;
    return { ...row, analysis: json<CoverageAnalysisStored>(row.analysis) };
  }

  latestCoverageRun(goldenVersion?: string): (CoverageRunSummary & { analysis: CoverageAnalysisStored }) | undefined {
    const row = (goldenVersion
      ? this.db.prepare("SELECT run_id FROM coverage_runs WHERE golden_version = ? ORDER BY created_at DESC LIMIT 1").get(goldenVersion)
      : this.db.prepare("SELECT run_id FROM coverage_runs ORDER BY created_at DESC LIMIT 1").get()) as { run_id: string } | undefined;
    return row ? this.coverageRun(row.run_id) : undefined;
  }

  startCoverage(opts: { window_days?: number; golden_version?: string; budget?: number; max_clusters?: number } = {}): JobRecord {
    const latest = this.latestTraceAt() ?? nowIso();
    const windowDays = opts.window_days ?? 7;
    const windowEnd = new Date(Date.parse(latest) + 60_000).toISOString();
    const windowStart = new Date(Date.parse(windowEnd) - windowDays * 86_400_000).toISOString();
    return this.runner.enqueue("coverage", {
      golden_version: opts.golden_version ?? this.currentGoldenVersion(),
      window_start: windowStart,
      window_end: windowEnd,
      budget: opts.budget ?? 10,
      max_clusters: opts.max_clusters ?? 3,
      seed: parseInt(getMeta(this.db, "seed") ?? "42", 10),
    });
  }

  // ---------- grading ----------

  harvest(opts: { coverage_run_id?: string; cluster_ids?: string[] } = {}): GradingItem[] {
    const run = opts.coverage_run_id ? this.coverageRun(opts.coverage_run_id) : this.latestCoverageRun();
    if (!run) throw new Error("run coverage first");
    const wanted = new Set(opts.cluster_ids ?? Object.keys(run.analysis.selections));
    const insert = this.db.prepare("INSERT OR IGNORE INTO grading_items(item_id,coverage_run_id,cluster_id,cluster_name,trace_id,role,status,judge,expert,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
    const created: GradingItem[] = [];
    for (const [clusterId, sel] of Object.entries(run.analysis.selections)) {
      if (!wanted.has(clusterId)) continue;
      const spot = run.analysis.blind_spots.find((b) => b.cluster_id === clusterId);
      for (const traceId of sel.ids) {
        const exists = this.db.prepare("SELECT 1 FROM grading_items WHERE trace_id = ?").get(traceId);
        if (exists) continue;
        const item: GradingItem = {
          item_id: newId("gr"),
          coverage_run_id: run.run_id,
          cluster_id: clusterId,
          cluster_name: spot?.name ?? clusterId,
          trace_id: traceId,
          role: sel.roles[traceId] ?? "random",
          status: "pending",
          judge: run.analysis.verdicts[traceId] ?? null,
          expert: null,
          created_at: nowIso(),
        };
        insert.run(item.item_id, item.coverage_run_id, item.cluster_id, item.cluster_name, item.trace_id, item.role, item.status, item.judge ? JSON.stringify(item.judge) : null, null, item.created_at);
        created.push(item);
      }
    }
    this.bus.emit("grading", { created: created.length });
    return created;
  }

  gradingQueue(opts: { status?: "pending" | "graded"; withTraces?: boolean } = {}): GradingItem[] {
    const rows = (opts.status
      ? this.db.prepare("SELECT * FROM grading_items WHERE status = ? ORDER BY cluster_id, created_at").all(opts.status)
      : this.db.prepare("SELECT * FROM grading_items ORDER BY cluster_id, created_at").all()) as Array<Record<string, string | null>>;
    return rows.map((r) => {
      const item: GradingItem = {
        item_id: r.item_id as string,
        coverage_run_id: r.coverage_run_id as string,
        cluster_id: r.cluster_id as string,
        cluster_name: r.cluster_name as string,
        trace_id: r.trace_id as string,
        role: r.role as string,
        status: r.status as GradingItem["status"],
        judge: r.judge ? json<JudgeVerdict>(r.judge) : null,
        expert: r.expert ? json<GradingItem["expert"]>(r.expert) : null,
        created_at: r.created_at as string,
      };
      if (opts.withTraces !== false) {
        const t = this.trace(item.trace_id);
        if (t) item.trace = t;
      }
      return item;
    });
  }

  gradeItem(itemId: string, expert: { decision: Decision; amount: number; note?: string; grader?: string }): GradingItem {
    const row = this.db.prepare("SELECT * FROM grading_items WHERE item_id = ?").get(itemId) as Record<string, string> | undefined;
    if (!row) throw new Error("unknown grading item");
    const record = { decision: expert.decision, amount: Math.max(0, Number(expert.amount) || 0), note: expert.note ?? "", grader: expert.grader ?? "expert", graded_at: nowIso() };
    this.db.prepare("UPDATE grading_items SET status = 'graded', expert = ? WHERE item_id = ?").run(JSON.stringify(record), itemId);
    const item = this.gradingQueue().find((g) => g.item_id === itemId) as GradingItem;
    this.bus.emit("grade", { item_id: itemId, cluster_id: item.cluster_id, status: "graded" });
    return item;
  }

  /** Demo only: plays the Contoso analysts, grading every pending item with the seed's hidden labels. */
  async simulateAnalyst(opts: { delay_ms?: number; grader?: string } = {}): Promise<{ graded: number }> {
    const pending = this.gradingQueue({ status: "pending", withTraces: false });
    let graded = 0;
    for (const item of pending) {
      const truth = this.db.prepare("SELECT expected FROM seed_truth WHERE trace_id = ?").get(item.trace_id) as { expected: string } | undefined;
      if (!truth) continue;
      const e = json<Expected>(truth.expected);
      this.gradeItem(item.item_id, { decision: e.decision, amount: e.amount, note: "demo: analyst label from seed", grader: opts.grader ?? ENGAGEMENT.discovery_graders[graded % 2] ?? "analyst" });
      graded++;
      if (opts.delay_ms) await new Promise((r) => setTimeout(r, opts.delay_ms));
    }
    return { graded };
  }

  agreement(): Array<{ cluster_id: string; cluster_name: string; graded: number; pending: number; agreement: number | null; kappa: number | null; mean_judge_confidence: number | null; expert_pass_rate: number | null }> {
    const items = this.gradingQueue();
    const byCluster = new Map<string, GradingItem[]>();
    for (const i of items) {
      if (!byCluster.has(i.cluster_id)) byCluster.set(i.cluster_id, []);
      (byCluster.get(i.cluster_id) as GradingItem[]).push(i);
    }
    return Array.from(byCluster.entries()).map(([cluster_id, list]) => {
      const graded = list.filter((i) => i.status === "graded" && i.expert && i.judge && i.trace);
      const judgePass = graded.map((i) => (i.judge as JudgeVerdict).pass);
      const expertPass = graded.map((i) => casePasses({ decision: (i.expert as NonNullable<GradingItem["expert"]>).decision, amount: (i.expert as NonNullable<GradingItem["expert"]>).amount }, (i.trace as Trace).output));
      const withJudge = list.filter((i) => i.judge);
      return {
        cluster_id,
        cluster_name: list[0]?.cluster_name ?? cluster_id,
        graded: graded.length,
        pending: list.filter((i) => i.status === "pending").length,
        agreement: graded.length ? agreementRate(judgePass, expertPass) : null,
        kappa: graded.length >= 4 ? cohenKappa(judgePass, expertPass) : null,
        mean_judge_confidence: withJudge.length ? withJudge.reduce((s, i) => s + (i.judge as JudgeVerdict).confidence, 0) / withJudge.length : null,
        expert_pass_rate: graded.length ? expertPass.filter(Boolean).length / graded.length : null,
      };
    });
  }

  // ---------- evaluation and gate ----------

  agentVersions() {
    return AGENT_VERSIONS.map((a) => ({ version: a.version, release_tag: a.release_tag, summary: a.summary, patch: a.patch }));
  }

  startEval(opts: { golden_version?: string; agent_version: string; baseline_run_id?: string; release_tag?: string }): JobRecord {
    const agent = agentByVersion(opts.agent_version);
    const goldenVersion = opts.golden_version ?? this.currentGoldenVersion();
    let baseline = opts.baseline_run_id;
    if (baseline === undefined) {
      const prev = this.evalRuns().find((r) => r.golden_version === goldenVersion && r.status === "complete");
      baseline = prev?.run_id;
    }
    return this.runner.enqueue("eval", {
      run_id: newId("run"),
      golden_version: goldenVersion,
      agent_version: agent.version,
      release_tag: opts.release_tag ?? agent.release_tag,
      baseline_run_id: baseline ?? null,
      seed: parseInt(getMeta(this.db, "seed") ?? "42", 10),
    });
  }

  evalRuns(): EvalRun[] {
    return (this.db.prepare("SELECT * FROM eval_runs ORDER BY created_at DESC").all() as Array<Record<string, string | null>>).map(rowToEvalRun);
  }

  evalRun(runId: string): EvalRun | undefined {
    const row = this.db.prepare("SELECT * FROM eval_runs WHERE run_id = ?").get(runId) as Record<string, string | null> | undefined;
    return row ? rowToEvalRun(row) : undefined;
  }

  gate(runId: string): (GateResult & { coverage: number | null }) | undefined {
    const row = this.db.prepare("SELECT * FROM gates WHERE run_id = ?").get(runId) as Record<string, string | number | null> | undefined;
    if (!row) return undefined;
    return { run_id: row.run_id as string, status: row.status as GateResult["status"], checks: json(row.checks as string), evaluated_at: row.evaluated_at as string, coverage: (row.coverage as number | null) ?? null };
  }

  latestGate(): (GateResult & { coverage: number | null; run: EvalRun }) | undefined {
    const row = this.db.prepare("SELECT g.run_id FROM gates g JOIN eval_runs r ON r.run_id = g.run_id ORDER BY r.created_at DESC LIMIT 1").get() as { run_id: string } | undefined;
    if (!row) return undefined;
    const g = this.gate(row.run_id);
    const run = this.evalRun(row.run_id);
    return g && run ? { ...g, run } : undefined;
  }

  overview() {
    const engagement = getMeta(this.db, "engagement");
    const current = this.currentGoldenVersion();
    const versions = this.goldenVersions();
    const latestEvalForCurrent = this.evalRuns().find((r) => r.golden_version === current && r.status === "complete");
    const latestEval = this.evalRuns().find((r) => r.status === "complete");
    const coverage = this.latestCoverageRun();
    const traceCount = (this.db.prepare("SELECT COUNT(*) AS n FROM traces").get() as { n: number }).n;
    const since = coverage ? (this.db.prepare("SELECT COUNT(*) AS n FROM traces WHERE received_at > ?").get(coverage.window_end) as { n: number }).n : traceCount;
    return {
      engagement: engagement ? JSON.parse(engagement) : ENGAGEMENT,
      golden: { current, versions },
      eval: latestEvalForCurrent ? summarizeRun(latestEvalForCurrent, this.gate(latestEvalForCurrent.run_id)) : latestEval ? summarizeRun(latestEval, this.gate(latestEval.run_id)) : null,
      coverage: coverage ? { ...coverage, analysis: undefined, blind_spots: coverage.analysis.blind_spots.slice(0, 5).map(({ trace_ids: _ids, ...b }) => b), value_at_risk_total: coverage.analysis.value_at_risk_total, long_tail: coverage.analysis.long_tail ?? null, traces_since: since } : null,
      traffic: { total: traceCount, latest: this.latestTraceAt(), daily: this.dailyStats(), replay: this.pendingReplay() },
      grading: this.agreement(),
      jobs: this.runner.list().slice(0, 8),
      embedder: this.embedder.name,
      judge: this.judge.name,
    };
  }

  // ---------- job definitions ----------

  private registerJobs(): void {
    type CovInput = { golden_version: string; window_start: string; window_end: string; budget: number; max_clusters: number; seed: number };
    this.runner.register<CovInput>({
      type: "coverage",
      label: (i) => `Coverage of ${i.window_start.slice(0, 10)} → ${i.window_end.slice(0, 10)} against golden ${i.golden_version}`,
      steps: (input) => [
        {
          name: "load window",
          run: ({ checkpoint, note }) => {
            const traces = this.traces({ since: input.window_start, until: input.window_end, limit: 100000 }).sort((a, b) => (a.received_at === b.received_at ? a.trace_id.localeCompare(b.trace_id) : a.received_at.localeCompare(b.received_at)));
            const golden = this.goldenCases(input.golden_version).sort((a, b) => a.case_id.localeCompare(b.case_id));
            checkpoint.trace_ids = traces.map((t) => t.trace_id);
            checkpoint.golden_ids = golden.map((g) => g.case_id);
            note(`${traces.length} traces, ${golden.length} golden cases`);
          },
        },
        {
          name: "embed claims",
          run: async ({ checkpoint, note }) => {
            const golden = this.goldenCases(input.golden_version);
            const traces = (checkpoint.trace_ids as string[]).map((id) => this.trace(id) as Trace);
            const gv = await this.embedder.embed(golden.map((g) => JSON.stringify(g.claim)));
            const tv = await this.embedder.embed(traces.map((t) => JSON.stringify(t.claim)));
            checkpoint.golden_vecs = gv.map(vecToB64);
            checkpoint.trace_vecs = tv.map(vecToB64);
            note(`${gv.length + tv.length} vectors via ${this.embedder.name} (${this.embedder.dim}-d)`);
          },
        },
        {
          name: "calibrate threshold and score coverage",
          run: ({ checkpoint, note }) => {
            const gv = (checkpoint.golden_vecs as string[]).map(b64ToVec);
            const tv = (checkpoint.trace_vecs as string[]).map(b64ToVec);
            const threshold = calibrateThreshold(gv, { seed: input.seed });
            const golden = (checkpoint.golden_ids as string[]).map((case_id, i) => ({ case_id, vec: gv[i] as Float32Array }));
            const traces = (checkpoint.trace_ids as string[]).map((trace_id, i) => ({ trace_id, vec: tv[i] as Float32Array }));
            const summary = computeCoverage(traces, golden, threshold);
            checkpoint.threshold = threshold;
            checkpoint.hits = summary.hits;
            checkpoint.coverage = summary.coverage;
            note(`threshold ${threshold.toFixed(3)} (5th pct of golden self-similarity); ${summary.covered}/${summary.total} covered = ${(summary.coverage * 100).toFixed(1)}%`);
          },
        },
        {
          name: "cluster uncovered traffic",
          run: ({ checkpoint, note }) => {
            const hits = checkpoint.hits as CoverageHit[];
            const traceIds = checkpoint.trace_ids as string[];
            const tv = (checkpoint.trace_vecs as string[]).map(b64ToVec);
            const golden = this.goldenCases(input.golden_version);
            const uncovered = traceIds.map((id, i) => ({ id, i })).filter((x) => !(hits[x.i] as CoverageHit).covered);
            const spots: BlindSpot[] = [];
            const clusterOf: Record<string, string> = {};
            if (uncovered.length >= 4) {
              const result = clusterVectors(uncovered.map((u) => tv[u.i] as Float32Array), { seed: input.seed });
              const goldenTokens = golden.map((g) => claimTokens(g.claim));
              for (let c = 0; c < result.k; c++) {
                const members = uncovered.filter((_, j) => result.assignments[j] === c);
                if (!members.length) continue;
                const traces = members.map((m) => this.trace(m.id) as Trace);
                const tokens = distinguishingTokens(traces.map((t) => claimTokens(t.claim)), goldenTokens, 3);
                const failing = traces.filter(hasFailureSignal).length;
                const meanSim = members.reduce((s, m) => s + (hits[m.i] as CoverageHit).similarity, 0) / members.length;
                const retailers: Record<string, number> = {};
                for (const t of traces) retailers[(t.claim as { retailer: string }).retailer] = (retailers[(t.claim as { retailer: string }).retailer] ?? 0) + 1;
                const medoid = selectRepresentatives(members.map((m) => ({ id: m.id, vec: tv[m.i] as Float32Array })), { budget: 1 });
                const volume_share = members.length / Math.max(1, traceIds.length);
                const failure_rate = failing / members.length;
                const novelty = Math.max(0, 1 - meanSim);
                spots.push({
                  cluster_id: `c${c}`,
                  name: tokens.join(" · ") || `cluster ${c + 1}`,
                  tokens,
                  trace_ids: members.map((m) => m.id),
                  volume: members.length,
                  volume_share,
                  failure_rate,
                  novelty,
                  score: volume_share * (0.25 + failure_rate) * novelty,
                  value_at_risk: traces.reduce((s, t) => s + claimedAmount(t), 0),
                  retailers,
                  medoid_trace_id: medoid.ids[0] ?? (members[0] as { id: string }).id,
                });
              }
            }
            const floor = Math.max(12, Math.round(traceIds.length * 0.03));
            const reported = spots.filter((s) => s.volume >= floor).sort((a, b) => b.score - a.score);
            const tail = spots.filter((s) => s.volume < floor);
            reported.forEach((s, i) => {
              s.cluster_id = `bs-${i + 1}`;
              for (const id of s.trace_ids) clusterOf[id] = s.cluster_id;
            });
            checkpoint.blind_spots = reported;
            checkpoint.cluster_of = clusterOf;
            checkpoint.long_tail = { clusters: tail.length, traces: tail.reduce((n, s) => n + s.volume, 0), value: tail.reduce((n, s) => n + s.value_at_risk, 0), floor };
            note(reported.length ? `${reported.length} blind spots above the reporting floor (${floor} traces): ${reported.map((s) => `${s.name} (${s.volume})`).join("; ")}${tail.length ? `; ${tail.reduce((n, s) => n + s.volume, 0)} traces in ${tail.length} smaller clusters below the floor` : ""}` : `no cluster reaches the reporting floor of ${floor} traces (${uncovered.length} uncovered traces in the long tail)`);
          },
        },
        {
          name: "judge pre-grades uncovered traces",
          run: async ({ checkpoint, note, progress }) => {
            const verdicts = (checkpoint.verdicts as Record<string, JudgeVerdict> | undefined) ?? {};
            const spots = checkpoint.blind_spots as BlindSpot[];
            const ids = spots.flatMap((s) => s.trace_ids);
            let done = 0;
            for (const id of ids) {
              if (verdicts[id]) continue;
              const t = this.trace(id) as Trace;
              verdicts[id] = await this.judge.grade(t.claim, t.output);
              done++;
              if (done % 100 === 0) {
                checkpoint.verdicts = verdicts;
                note(`${Object.keys(verdicts).length}/${ids.length} pre-graded by ${this.judge.name}`);
                progress();
              }
            }
            checkpoint.verdicts = verdicts;
            note(`${ids.length} uncovered traces pre-graded by ${this.judge.name}`);
          },
        },
        {
          name: "select representatives for expert grading",
          run: ({ checkpoint, note }) => {
            const spots = checkpoint.blind_spots as BlindSpot[];
            const verdicts = checkpoint.verdicts as Record<string, JudgeVerdict>;
            const traceIds = checkpoint.trace_ids as string[];
            const tv = (checkpoint.trace_vecs as string[]).map(b64ToVec);
            const index = new Map(traceIds.map((id, i) => [id, i]));
            const selections: Record<string, Selection> = {};
            for (const s of spots.slice(0, input.max_clusters)) {
              const candidates = s.trace_ids.map((id) => {
                const v = verdicts[id];
                return { id, vec: tv[index.get(id) as number] as Float32Array, judge_confidence: v?.confidence, judge_disagrees: v ? !v.pass : false };
              });
              selections[s.cluster_id] = selectRepresentatives(candidates, { budget: input.budget, seed: input.seed });
            }
            checkpoint.selections = selections;
            note(`${Object.values(selections).reduce((n, s) => n + s.ids.length, 0)} cases selected (medoid + neighbours + random + judge disagreements) across ${Object.keys(selections).length} blind spots`);
          },
        },
        {
          name: "project map and persist run",
          run: ({ checkpoint, note }) => {
            const gv = (checkpoint.golden_vecs as string[]).map(b64ToVec);
            const tv = (checkpoint.trace_vecs as string[]).map(b64ToVec);
            const hitsAll = checkpoint.hits as CoverageHit[];
            const clusterMap = checkpoint.cluster_of as Record<string, string>;
            const traceIdsAll = checkpoint.trace_ids as string[];
            const groups = [{ key: "golden", indices: [...gv.map((_, i) => i), ...traceIdsAll.map((_, i) => ((hitsAll[i] as CoverageHit).covered ? gv.length + i : -1)).filter((i) => i >= 0)] }];
            const spotsForLayout = checkpoint.blind_spots as BlindSpot[];
            const indexOfTrace = new Map(traceIdsAll.map((id, i) => [id, gv.length + i]));
            for (const b of spotsForLayout) groups.push({ key: b.cluster_id, indices: b.trace_ids.map((id) => indexOfTrace.get(id) as number) });
            const placed = new Set(groups.flatMap((g) => g.indices));
            groups.push({ key: "tail", indices: [...gv, ...tv].map((_, i) => i).filter((i) => !placed.has(i)) });
            void clusterMap;
            const coords = layoutMap([...gv, ...tv], groups, input.seed);
            const goldenIds = checkpoint.golden_ids as string[];
            const traceIds = checkpoint.trace_ids as string[];
            const hits = checkpoint.hits as CoverageHit[];
            const clusterOf = checkpoint.cluster_of as Record<string, string>;
            const map: MapPoint[] = [];
            goldenIds.forEach((id, i) => map.push({ id, kind: "golden", x: round4((coords[i] as [number, number])[0]), y: round4((coords[i] as [number, number])[1]) }));
            traceIds.forEach((id, i) => {
              const c = coords[gv.length + i] as [number, number];
              map.push({ id, kind: (hits[i] as CoverageHit).covered ? "covered" : "uncovered", x: round4(c[0]), y: round4(c[1]), ...(clusterOf[id] ? { cluster_id: clusterOf[id] as string } : {}) });
            });
            const spots = checkpoint.blind_spots as BlindSpot[];
            const analysis: CoverageAnalysisStored = {
              hits,
              blind_spots: spots,
              map,
              verdicts: checkpoint.verdicts as Record<string, JudgeVerdict>,
              selections: checkpoint.selections as Record<string, Selection>,
              value_at_risk_total: spots.reduce((s, b) => s + b.value_at_risk, 0),
              trace_count: traceIds.length,
              long_tail: checkpoint.long_tail as CoverageAnalysisStored["long_tail"],
            };
            const runId = newId("cov");
            const covered = hits.filter((h) => h.covered).length;
            this.db
              .prepare("INSERT INTO coverage_runs(run_id,created_at,golden_version,window_start,window_end,embedder,judge,threshold,coverage,covered,total,analysis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
              .run(runId, nowIso(), input.golden_version, input.window_start, input.window_end, this.embedder.name, this.judge.name, checkpoint.threshold as number, checkpoint.coverage as number, covered, hits.length, JSON.stringify(analysis));
            checkpoint.run_id = runId;
            delete checkpoint.golden_vecs;
            delete checkpoint.trace_vecs;
            delete checkpoint.verdicts;
            note(`coverage run ${runId} saved`);
            this.bus.emit("coverage", { run_id: runId, coverage: checkpoint.coverage, golden_version: input.golden_version });
          },
        },
      ],
      finish: (_input, checkpoint) => ({ run_id: checkpoint.run_id, coverage: checkpoint.coverage, threshold: checkpoint.threshold }),
    });

    type EvalInput = { run_id: string; golden_version: string; agent_version: string; release_tag: string; baseline_run_id: string | null; seed: number };
    this.runner.register<EvalInput>({
      type: "eval",
      label: (i) => `Evaluate ${i.release_tag} (agent ${i.agent_version}) on golden ${i.golden_version}`,
      steps: (input) => [
        {
          name: "materialize golden version",
          run: ({ checkpoint, note }) => {
            const cases = this.goldenCases(input.golden_version).sort((a, b) => ((a.claim as { submitted_at: string }).submitted_at < (b.claim as { submitted_at: string }).submitted_at ? -1 : 1));
            checkpoint.case_ids = cases.map((c) => c.case_id);
            this.db
              .prepare("INSERT OR REPLACE INTO eval_runs(run_id,created_at,golden_version,agent_version,release_tag,baseline_run_id,status,results,metrics) VALUES (?,?,?,?,?,?,?,?,?)")
              .run(input.run_id, nowIso(), input.golden_version, input.agent_version, input.release_tag, input.baseline_run_id, "running", "[]", null);
            note(`${cases.length} cases pinned to ${input.golden_version}`);
          },
        },
        {
          name: "replay cases through the agent",
          run: async ({ checkpoint, note, progress }) => {
            const agent = agentByVersion(input.agent_version);
            const byId = new Map(this.goldenCases(input.golden_version).map((c) => [c.case_id, c]));
            const ids = checkpoint.case_ids as string[];
            const results = (checkpoint.results as CaseResult[] | undefined) ?? [];
            const ctx = newContext();
            for (const inv of (checkpoint.seen_invoices as string[] | undefined) ?? []) ctx.seenInvoices.add(inv);
            const batch = 40;
            for (let i = results.length; i < ids.length; i += batch) {
              for (const id of ids.slice(i, i + batch)) {
                const g = byId.get(id) as GoldenCase;
                const output = agent.run(g.claim, ctx);
                results.push({ case_id: id, output, pass: casePasses(g.expected, output), ...(g.cluster_id ? { cluster_id: g.cluster_id } : {}) });
              }
              checkpoint.results = results;
              checkpoint.seen_invoices = Array.from(ctx.seenInvoices);
              note(`${results.length}/${ids.length} cases`);
              this.db.prepare("UPDATE eval_runs SET results = ? WHERE run_id = ?").run(JSON.stringify(results), input.run_id);
              progress();
              await new Promise((r) => setTimeout(r, 25));
            }
            note(`${results.length} cases replayed through agent ${input.agent_version}`);
          },
        },
        {
          name: "aggregate with bootstrap intervals",
          run: ({ checkpoint, note }) => {
            const results = checkpoint.results as CaseResult[];
            const cases = this.goldenCases(input.golden_version);
            const byId = new Map(cases.map((c) => [c.case_id, c]));
            const passes = results.map((r) => (r.pass ? 1 : 0));
            const clusterNames = new Map<string, string>();
            for (const c of cases) if (c.cluster_id && c.cluster_name) clusterNames.set(c.cluster_id, c.cluster_name);
            const metrics: EvalMetrics = {
              n: results.length,
              accuracy: bootstrapMeanCI(passes, { seed: input.seed }),
              by_cluster: segment(results, (r) => r.cluster_id, (k) => clusterNames.get(k) ?? k),
              by_retailer: segment(results, (r) => (byId.get(r.case_id)?.claim as { retailer: string } | undefined)?.retailer, (k) => k),
              by_source: segment(results, (r) => byId.get(r.case_id)?.source, (k) => k),
            };
            if (input.baseline_run_id) {
              const base = this.evalRun(input.baseline_run_id);
              if (base) {
                const basePass = new Map(base.results.map((r) => [r.case_id, r.pass ? 1 : 0]));
                const shared = results.filter((r) => basePass.has(r.case_id));
                if (shared.length >= 2) {
                  metrics.delta_vs_baseline = {
                    ...pairedBootstrapCI(shared.map((r) => (r.pass ? 1 : 0)), shared.map((r) => basePass.get(r.case_id) as number), { seed: input.seed }),
                    baseline_run_id: base.run_id,
                  };
                }
              }
            }
            checkpoint.metrics = metrics;
            this.db.prepare("UPDATE eval_runs SET status = 'complete', metrics = ? WHERE run_id = ?").run(JSON.stringify(metrics), input.run_id);
            note(`${(metrics.accuracy.estimate * 100).toFixed(1)}% [${(metrics.accuracy.lo * 100).toFixed(1)}, ${(metrics.accuracy.hi * 100).toFixed(1)}] over ${metrics.accuracy.n_boot.toLocaleString()} resamples`);
            this.bus.emit("eval", { run_id: input.run_id, status: "complete" });
          },
        },
        {
          name: "evaluate release gate",
          run: ({ note }) => {
            const run = this.evalRun(input.run_id) as EvalRun;
            const cov = this.latestCoverageRun(input.golden_version);
            const gate = evaluateGate({ run, coverage: cov ? cov.coverage : null, evaluated_at: nowIso() });
            this.db.prepare("INSERT OR REPLACE INTO gates(run_id,status,checks,evaluated_at,coverage) VALUES (?,?,?,?,?)").run(gate.run_id, gate.status, JSON.stringify(gate.checks), gate.evaluated_at, cov ? cov.coverage : null);
            note(`${gate.status}: ${gate.checks.filter((c) => !c.pass).map((c) => c.name).join(", ") || "all checks pass"}`);
            this.bus.emit("gate", gate);
          },
        },
      ],
      finish: (input, checkpoint) => ({ run_id: input.run_id, metrics: checkpoint.metrics }),
    });
  }
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

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function rowToTrace(r: Record<string, string>): Trace {
  return { trace_id: r.trace_id!, received_at: r.received_at!, agent_version: r.agent_version!, claim: json(r.claim), output: json(r.output), signals: json(r.signals) };
}

function rowToGoldenCase(r: Record<string, string | null>): GoldenCase {
  return {
    case_id: r.case_id as string,
    claim: json(r.claim as string),
    expected: json(r.expected as string),
    source: r.source as GoldenCase["source"],
    ...(r.cluster_id ? { cluster_id: r.cluster_id } : {}),
    ...(r.cluster_name ? { cluster_name: r.cluster_name } : {}),
    graded_by: r.graded_by as string,
    graded_at: r.graded_at as string,
  };
}

function rowToEvalRun(r: Record<string, string | null>): EvalRun {
  return {
    run_id: r.run_id as string,
    created_at: r.created_at as string,
    golden_version: r.golden_version as string,
    agent_version: r.agent_version as string,
    release_tag: r.release_tag as string,
    ...(r.baseline_run_id ? { baseline_run_id: r.baseline_run_id } : {}),
    status: r.status as EvalRun["status"],
    results: json(r.results as string),
    ...(r.metrics ? { metrics: json<EvalMetrics>(r.metrics) } : {}),
  };
}

export function summarizeRun(run: EvalRun, gate?: GateResult & { coverage: number | null }) {
  return {
    run_id: run.run_id,
    created_at: run.created_at,
    golden_version: run.golden_version,
    agent_version: run.agent_version,
    release_tag: run.release_tag,
    baseline_run_id: run.baseline_run_id ?? null,
    status: run.status,
    n: run.results.length,
    metrics: run.metrics ?? null,
    gate: gate ?? null,
  };
}
