import React from "react";
import { CoverageMap, clusterColor } from "@web/components/CoverageMap";
import { GradingCard } from "@web/components/GradingCard";
import { AgreementMeters } from "@web/components/Agreement";
import { JobPipeline } from "@web/components/JobPipeline";
import { Caption, Code, Eyebrow, Fade, Kinetic, Scene, Terminal, Window } from "../components/Primitives";
import { ramp, useT } from "../lib/anim";
import type { Snapshot } from "../data/types";
import { CODE_COVERAGE } from "./Part1";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

export const Move1: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const t = useT();
  const reveal = ramp(t, 0.6, 4.2, "linear");
  const spots = snap.coverage_v1.analysis.blind_spots.slice(0, 3);
  return (
    <Scene seconds={seconds}>
      <div className="lower">
        <Eyebrow start={0.1}>Move 1 of 3</Eyebrow>
        <Kinetic text="Find the traffic the eval has never seen." start={0.3} size={48} />
      </div>
      <Fade start={0.4} style={{ position: "absolute", left: 96, top: 230, width: 980 }}>
        <Window title="Blindspot · traffic map · last 7 days vs golden v1" width={980} bodyStyle={{ padding: 14 }}>
          <div style={{ fontSize: 13 }}>
            <CoverageMap points={snap.coverage_v1.analysis.map} blindSpots={snap.coverage_v1.analysis.blind_spots} width={940} height={520} reveal={reveal} showLabels />
          </div>
        </Window>
      </Fade>
      <div style={{ position: "absolute", left: 1120, top: 230, width: 720 }}>
        <Code file="packages/core/src/coverage.ts" lines={CODE_COVERAGE} start={1.0} hlStart={4.2} style={{ fontSize: 19 }} />
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          {spots.map((b, i) => (
            <Fade key={b.cluster_id} start={6.2 + i * 0.35} y={10}>
              <div className="pill" style={{ fontSize: 19, borderColor: clusterColor(b.cluster_id), width: "100%", justifyContent: "space-between" }}>
                <span>
                  <span className="dot" style={{ background: clusterColor(b.cluster_id), marginRight: 10 }} />
                  {b.cluster_id} · <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 500 }}>{b.name}</span>
                </span>
                <span style={{ color: "var(--text-2)", fontWeight: 500 }}>
                  {b.volume} · {pct(b.failure_rate, 0)} failing
                </span>
              </div>
            </Fade>
          ))}
        </div>
      </div>
      <Caption start={7.6}>
        Clusters are named by the <b>fields that set them apart</b>, never by a label anyone typed.
      </Caption>
    </Scene>
  );
};

const CODE_SELECT = [
  { text: "// the few cases worth an expert's time" },
  { text: "export function selectRepresentatives(cands, budget = 10) {" },
  { text: "  pick(medoid(cands));              // the typical claim", hl: true },
  { text: "  pick(...nearest(medoid, 2));      // its shape" },
  { text: "  pick(...random(cands, 2, seed));  // what typical misses" },
  { text: "  pick(...cands.filter(c => c.judge_disagrees" },
  { text: "        || c.judge_confidence < 0.6)); // judge wobbles", hl: true },
  { text: "  return fill(budget);" },
  { text: "}" },
];

export const Move2: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const item = snap.grading[0]!;
  const prefill = item.expert ? { decision: item.expert.decision, amount: item.expert.amount } : null;
  return (
    <Scene seconds={seconds}>
      <div className="lower">
        <Eyebrow start={0.1}>Move 2 of 3</Eyebrow>
        <Kinetic text="Grade ten, not a thousand." start={0.3} size={48} />
      </div>
      <div style={{ position: "absolute", left: 96, top: 230, width: 760 }}>
        <Code file="packages/core/src/select.ts" lines={CODE_SELECT} start={0.5} hlStart={2.2} style={{ fontSize: 19 }} />
        <Fade start={6.4} style={{ marginTop: 22 }}>
          <Window title="Can the judge be trusted here?" width={760} bodyStyle={{ padding: "10px 18px" }}>
            <div style={{ fontSize: 15 }}>
              <AgreementMeters rows={snap.agreement} judgeName="simulated judge" />
            </div>
          </Window>
        </Fade>
      </div>
      <Fade start={2.4} style={{ position: "absolute", left: 900, top: 230, width: 940 }}>
        <Window title="Blindspot · grading queue · case 1 of 30" width={940} scale={0.72} bodyStyle={{ padding: 16 }}>
          <div style={{ fontSize: 15 }}>
            <GradingCard item={{ ...item, status: "pending", expert: null }} index={0} total={30} highlight={["line_items", "export_version", "invoice_refs"]} prefill={prefill} />
          </div>
        </Window>
      </Fade>
      <Caption start={8.4}>
        Judge agreement here: <b>30–50%</b>, confidence 0.4. Not validated here, not trusted here.
      </Caption>
    </Scene>
  );
};

const CODE_GATE = [
  { text: "const policy = {" },
  { text: "  min_coverage: 0.85,           // of last-7-day traffic", hl: true },
  { text: "  min_cluster_pass_rate: 0.8,   // per harvested blind spot", hl: true },
  { text: "  min_accuracy: 0.85," },
  { text: "  regression_tolerance: 0.01,   // paired-bootstrap CI upper bound", hl: true },
  { text: "};" },
  { text: "" },
  { text: "// a partial run never passes; a 2-pt move inside the CI never blocks" },
  { text: "status = run.complete && checks.every(c => c.pass) ? \"PASS\" : \"BLOCKED\";" },
];

export const Move3: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const g = snap.gates.r13_v2;
  const job = snap.jobs.find((j) => j.type === "coverage") ?? snap.jobs[0]!;
  const t = useT();
  const stepsDone = Math.floor(ramp(t, 6.4, 2.4, "linear") * job.steps.length);
  const animatedJob = { ...job, steps: job.steps.map((s, i) => ({ ...s, status: i < stepsDone ? ("done" as const) : i === stepsDone ? ("running" as const) : ("pending" as const) })) };
  return (
    <Scene seconds={seconds}>
      <div className="lower">
        <Eyebrow start={0.1}>Move 3 of 3</Eyebrow>
        <Kinetic text="Block the release." start={0.3} size={48} />
      </div>
      <div style={{ position: "absolute", left: 96, top: 230, width: 880 }}>
        <Code file="packages/core/src/gate.ts" lines={CODE_GATE} start={0.5} hlStart={1.8} style={{ fontSize: 19 }} />
      </div>
      <div style={{ position: "absolute", left: 1020, top: 230, width: 820 }}>
        <Terminal
          width={820}
          style={{ fontSize: 18 }}
          lines={[
            { text: "npx blindspot gate", cls: "p", at: 2.6 },
            { text: `BLOCKED  release/1.3 on golden v2`, cls: "bad", at: 3.5 },
            ...g.checks.map((c, i) => {
              const name = c.name.replace("blind spot: ", "blind spot ").length > 44 ? c.name.replace("blind spot: ", "").slice(0, 41) + "…" : c.name;
              const value = c.value === null ? "–" : `${(c.value * 100).toFixed(1)}%`;
              return { text: `  ${c.pass ? "✓" : "✗"} ${name.padEnd(46)} ${value.padStart(6)}  need ≥ ${(c.threshold * 100).toFixed(0)}%`, cls: (c.pass ? "ok" : "bad") as "ok" | "bad", at: 3.8 + i * 0.3 };
            }),
            { text: "exit code 1", cls: "dim", at: 3.9 + g.checks.length * 0.3 },
          ]}
        />
      </div>
      <Fade start={6.2} style={{ position: "absolute", left: 96, top: 700, width: 1744 }}>
        <Window title={`durable job · ${job.label}`} width={1744} bodyStyle={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 14 }}>
            <JobPipeline job={animatedJob} compact />
          </div>
        </Window>
      </Fade>
      <Caption start={8.0}>
        A CLI with an exit code, so it lives in CI. Jobs checkpoint every step: <b>resume, never restart.</b>
      </Caption>
    </Scene>
  );
};

const Box: React.FC<{ x: number; y: number; w: number; at: number; title: string; sub: string; tone?: string }> = ({ x, y, w, at, title, sub, tone = "" }) => {
  const t = useT();
  const a = ramp(t, at, 0.4);
  return (
    <div className={`node ${tone}`} style={{ left: x, top: y, width: w, opacity: a, transform: `translateY(${(1 - a) * 14}px)`, fontSize: 22, whiteSpace: "normal" }}>
      {title}
      <small>{sub}</small>
    </div>
  );
};

const Link: React.FC<{ x1: number; y1: number; x2: number; y2: number; at: number }> = ({ x1, y1, x2, y2, at }) => {
  const t = useT();
  const a = ramp(t, at, 0.4, "inout");
  return (
    <svg style={{ position: "absolute", left: 0, top: 0 }} width={1920} height={1080}>
      <line x1={x1} y1={y1} x2={x1 + (x2 - x1) * a} y2={y1 + (y2 - y1) * a} stroke="var(--border-strong)" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
};

export const Stack: React.FC<{ seconds: number }> = ({ seconds }) => (
  <Scene seconds={seconds}>
    <div className="lower">
      <Eyebrow start={0.1}>How it is built</Eyebrow>
      <Kinetic text="TypeScript end to end." start={0.3} size={48} />
    </div>
    <Box x={96} y={300} w={250} at={0.8} title="Agent traces" sub="POST /api/traces · JSON · BYO" />
    <Link x1={346} y1={340} x2={420} y2={340} at={1.2} />
    <Box x={420} y={285} w={420} at={1.4} title="Durable job runner" sub="embed → cover → cluster → judge → select · checkpoints in SQLite, resumes after a crash" tone="accent" />
    <Link x1={840} y1={340} x2={915} y2={340} at={2.0} />
    <Box x={915} y={300} w={330} at={2.2} title="Grading queue" sub="React · keyboard-first · roles" />
    <Link x1={1245} y1={340} x2={1320} y2={340} at={2.7} />
    <Box x={1320} y={285} w={500} at={2.9} title="Golden set vN" sub="immutable, content-addressed · exported as a Foundry evaluation dataset (JSONL)" tone="success" />
    <Link x1={1570} y1={395} x2={1570} y2={500} at={3.5} />
    <Box x={1320} y={500} w={500} at={3.7} title="Evaluation" sub="replay through the agent · paired-bootstrap CIs (10k resamples) · per-blind-spot pass rates" />
    <Link x1={1320} y1={560} x2={1245} y2={560} at={4.3} />
    <Box x={700} y={500} w={545} at={4.5} title="Release gate" sub="coverage · blind spots · regression · CLI exit code for CI" tone="danger" />
    <Fade start={5.2} style={{ position: "absolute", left: 96, top: 700, display: "flex", gap: 14, flexWrap: "wrap", width: 1744 }}>
      {["Vite + React 19", "Fastify + node:sqlite (no native deps)", "REST + server-sent events", "vitest · coverage, clustering, bootstrap, gate", "optional Azure OpenAI embedder + judge", "graceful fallback: hashing embedder, simulated judge, expert-only routing"].map((s, i) => (
        <Fade key={s} start={5.3 + i * 0.15} y={8}>
          <span className="pill" style={{ fontSize: 20, fontWeight: 500 }}>{s}</span>
        </Fade>
      ))}
    </Fade>
    <Caption start={6.8}>
      Checkpointed jobs map one-to-one onto <b>Durable Functions</b> or <b>Temporal</b> activities in production.
    </Caption>
  </Scene>
);
