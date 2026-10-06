import { buildApp, createContext } from "./app.js";
import type { JobRecord } from "./jobs.js";

const [, , command = "help", ...rest] = process.argv;
const flags = new Map<string, string>();
for (let i = 0; i < rest.length; i++) {
  const a = rest[i] as string;
  if (a.startsWith("--")) flags.set(a.slice(2), rest[i + 1] && !(rest[i + 1] as string).startsWith("--") ? (rest[++i] as string) : "true");
}
const dbPath = process.env.BLINDSPOT_DB ?? "./data/blindspot.sqlite";
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

async function waitJob(ctx: ReturnType<typeof createContext>, job: JobRecord, quiet = false): Promise<JobRecord> {
  if (!quiet) {
    let lastStep = "";
    const unsub = ctx.bus.subscribe({ raw: { write: (chunk: string) => {
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) return true;
      const e = JSON.parse(line.slice(6)) as { type: string; payload: JobRecord };
      if (e.type !== "job" || e.payload.job_id !== job.job_id) return true;
      const step = e.payload.steps.find((s) => s.status === "running") ?? e.payload.steps.filter((s) => s.status === "done").pop();
      if (step && step.name !== lastStep) {
        lastStep = step.name;
        process.stdout.write(`   • ${step.name}\n`);
      }
      return true;
    } } } as never);
    const done = await ctx.runner.wait(job.job_id);
    unsub();
    for (const s of done.steps) if (s.note) process.stdout.write(`     ${s.name}: ${s.note}\n`);
    return done;
  }
  return ctx.runner.wait(job.job_id);
}

if (command === "seed") {
  const ctx = createContext(dbPath);
  const r = ctx.svc.seedDemo({ days: Number(flags.get("days") ?? 7) });
  console.log(`seeded: ${r.golden} golden cases, ${r.traces} traces ingested, ${r.pending} held for replay (db: ${dbPath})`);
} else if (command === "demo") {
  const ctx = createContext(dbPath);
  if (!ctx.svc.isSeeded() || flags.has("reset")) {
    const r = ctx.svc.seedDemo({ days: 7 });
    console.log(`seeded: ${r.golden} golden cases, ${r.traces} traces, ${r.pending} held for replay`);
  }
  ctx.runner.resumeIncomplete();
  const port = Number(flags.get("port") ?? process.env.BLINDSPOT_PORT ?? process.env.PORT ?? 4040);
  const app = await buildApp(ctx);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`\nBlindspot demo: http://localhost:${port}\n  1. Replay 7 days of traffic   2. Run coverage   3. Harvest + grade   4. Commit golden v2   5. Evaluate a release\n`);
} else if (command === "story") {
  const ctx = createContext(dbPath);
  ctx.svc.seedDemo({ days: 7, baseline: false });
  console.log("\nBLINDSPOT — Contoso Foods deduction-claim validator\n");
  console.log("1. Baseline: golden v1, release/1.3");
  const base = await waitJob(ctx, ctx.svc.startEval({ golden_version: "v1", agent_version: "1.3.0" }), true);
  const baseRun = ctx.svc.evalRun((base.input as { run_id: string }).run_id)!;
  console.log(`   accuracy ${pct(baseRun.metrics!.accuracy.estimate)} [${pct(baseRun.metrics!.accuracy.lo)}, ${pct(baseRun.metrics!.accuracy.hi)}] on ${baseRun.results.length} cases → the dashboard is green\n`);
  console.log("2. Replay the next 7 days of production traffic");
  ctx.svc.replay({ instant: true });
  const daily = ctx.svc.dailyStats();
  const last = daily.slice(-7);
  const first = daily.slice(0, 7);
  const rate = (d: typeof daily) => d.reduce((s, x) => s + x.overrides, 0) / Math.max(1, d.reduce((s, x) => s + x.volume, 0));
  console.log(`   analyst override rate: ${pct(rate(first))} → ${pct(rate(last))}; escalations ${first.reduce((s, x) => s + x.escalations, 0)} → ${last.reduce((s, x) => s + x.escalations, 0)}\n`);
  console.log("3. Coverage of the last 7 days against golden v1");
  const cov = await waitJob(ctx, ctx.svc.startCoverage({ window_days: 7 }));
  const covRun = ctx.svc.latestCoverageRun()!;
  console.log(`   → ${pct(covRun.coverage)} covered; blind spots ranked by volume × failure signals × novelty:`);
  for (const b of covRun.analysis.blind_spots) console.log(`     ${b.cluster_id}  ${b.name.padEnd(56)} n=${String(b.volume).padStart(3)}  fail=${pct(b.failure_rate).padStart(6)}  novelty=${b.novelty.toFixed(2)}  score=${b.score.toFixed(4)}`);
  console.log("");
  console.log("4. Harvest: 10 representatives per blind spot → expert grading queue");
  const items = ctx.svc.harvest();
  console.log(`   ${items.length} cases queued (roles: ${Object.entries(items.reduce((m, i) => ({ ...m, [i.role]: (m[i.role] ?? 0) + 1 }), {} as Record<string, number>)).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  await ctx.svc.simulateAnalyst();
  for (const a of ctx.svc.agreement()) console.log(`   ${a.cluster_name.padEnd(56)} judge↔expert agreement ${a.agreement === null ? "n/a" : pct(a.agreement)}  judge confidence ${a.mean_judge_confidence?.toFixed(2)}`);
  console.log("");
  console.log("5. Commit golden v2 and re-run release/1.3 on it");
  const v2 = ctx.svc.commitGolden();
  console.log(`   ${v2.version}: ${v2.case_ids.length} cases, sha ${v2.sha256.slice(0, 12)}… — ${v2.note}`);
  const r13 = await waitJob(ctx, ctx.svc.startEval({ golden_version: "v2", agent_version: "1.3.0" }), true);
  const run13 = ctx.svc.evalRun((r13.input as { run_id: string }).run_id)!;
  printRun(ctx, run13);
  const cov2 = await waitJob(ctx, ctx.svc.startCoverage({ window_days: 7, golden_version: "v2" }), true);
  console.log(`   coverage against v2: ${pct(ctx.svc.latestCoverageRun("v2")!.coverage)}\n`);
  console.log("6. Ship the parser patch (release/1.4) and re-evaluate");
  const r14 = await waitJob(ctx, ctx.svc.startEval({ golden_version: "v2", agent_version: "1.4.0", baseline_run_id: run13.run_id }), true);
  const run14 = ctx.svc.evalRun((r14.input as { run_id: string }).run_id)!;
  printRun(ctx, run14);
  console.log("7. Control: release/1.5 moves the number a little");
  const r15 = await waitJob(ctx, ctx.svc.startEval({ golden_version: "v2", agent_version: "1.5.0", baseline_run_id: run14.run_id }), true);
  const run15 = ctx.svc.evalRun((r15.input as { run_id: string }).run_id)!;
  printRun(ctx, run15);
  void cov; void cov2;
  if (flags.has("snapshot")) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    const out = flags.get("snapshot") as string;
    const covV1 = ctx.svc.coverageRuns().find((r) => r.golden_version === "v1")!;
    const covV1Full = ctx.svc.coverageRun(covV1.run_id)!;
    const covV2Full = ctx.svc.latestCoverageRun("v2")!;
    const queue = ctx.svc.gradingQueue();
    const snapshot = {
      engagement: ctx.svc.overview().engagement,
      daily: ctx.svc.dailyStats(),
      baseline: { run: baseRun, gate: ctx.svc.gate(baseRun.run_id) },
      coverage_v1: { ...covV1Full, analysis: { ...covV1Full.analysis, verdicts: undefined, hits: undefined } },
      coverage_v2: { ...covV2Full, analysis: { ...covV2Full.analysis, verdicts: undefined, hits: undefined, map: undefined } },
      blind_spots: covV1Full.analysis.blind_spots.map((b) => ({ ...b, medoid: ctx.svc.trace(b.medoid_trace_id), examples: b.trace_ids.slice(0, 3).map((id) => ctx.svc.trace(id)) })),
      golden_example: ctx.svc.goldenCases("v1")[0],
      grading: queue,
      agreement: ctx.svc.agreement(),
      golden_versions: ctx.svc.goldenVersions(),
      golden_diff: ctx.svc.goldenDiff("v1", "v2"),
      runs: { r13_v2: run13, r14: run14, r15: run15 },
      gates: { r13_v2: ctx.svc.gate(run13.run_id), r14: ctx.svc.gate(run14.run_id), r15: ctx.svc.gate(run15.run_id) },
      agent_versions: ctx.svc.agentVersions(),
      jobs: ctx.runner.list(),
    };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(snapshot));
    console.log(`snapshot written to ${out}`);
  }
  const finalGate = ctx.svc.gate(run14.run_id)!;
  process.exit(finalGate.status === "PASS" ? 0 : 1);
} else if (command === "gate") {
  const ctx = createContext(dbPath);
  const g = flags.has("run") ? ctx.svc.gate(flags.get("run") as string) : ctx.svc.latestGate();
  if (!g) {
    console.error("no gate evaluated yet");
    process.exit(2);
  }
  console.log(`${g.status}  run ${g.run_id}`);
  for (const c of g.checks) console.log(`  ${c.pass ? "✓" : "✗"} ${c.name}: ${c.detail}`);
  process.exit(g.status === "PASS" ? 0 : 1);
} else {
  console.log(`blindspot <seed [--days 7|14] | demo [--reset] | story [--snapshot <file>] | gate [--run <id>]>`);
}

function printRun(ctx: ReturnType<typeof createContext>, run: NonNullable<ReturnType<ReturnType<typeof createContext>["svc"]["evalRun"]>>) {
  const m = run.metrics!;
  const g = ctx.svc.gate(run.run_id)!;
  console.log(`   ${run.release_tag} on ${run.golden_version}: ${pct(m.accuracy.estimate)} [${pct(m.accuracy.lo)}, ${pct(m.accuracy.hi)}]${m.delta_vs_baseline ? `  Δ ${(m.delta_vs_baseline.estimate * 100).toFixed(1)} pts [${(m.delta_vs_baseline.lo * 100).toFixed(1)}, ${(m.delta_vs_baseline.hi * 100).toFixed(1)}]` : ""}`);
  for (const c of m.by_cluster) console.log(`     ${c.label.padEnd(56)} ${pct(c.pass_rate).padStart(6)} on ${c.n}`);
  console.log(`   gate: ${g.status}${g.status === "BLOCKED" ? " — " + g.checks.filter((c) => !c.pass).map((c) => c.name).join("; ") : ""}\n`);
}
