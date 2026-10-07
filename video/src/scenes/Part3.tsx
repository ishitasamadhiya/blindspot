import React from "react";
import { GateBanner, GateChecks } from "@web/components/Gate";
import { IntervalBar } from "@web/components/Interval";
import { SegmentBars } from "@web/components/SegmentBars";
import { Patch } from "@web/components/Patch";
import { VersionTimeline } from "@web/components/VersionTimeline";
import { StatTile } from "@web/components/StatTile";
import { clusterColor } from "@web/components/CoverageMap";
import { Caption, Eyebrow, Fade, Kinetic, Logo, Scene, Shot, Window } from "../components/Primitives";
import { Camera, Counter, Sfx, Stamp } from "../components/Motion";
import { ramp, useT } from "../lib/anim";
import type { Snapshot } from "../data/types";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const pts = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} pts`;

export const Before: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const acc = snap.baseline.run.metrics!.accuracy;
  const daily = snap.daily.slice(-7);
  const over = daily.reduce((s, d) => s + d.overrides, 0) / daily.reduce((s, d) => s + d.volume, 0);
  const before = snap.daily.slice(0, 7);
  const overBefore = before.reduce((s, d) => s + d.overrides, 0) / Math.max(1, before.reduce((s, d) => s + d.volume, 0));
  return (
    <Scene seconds={seconds}>
      {[0.2, 0.45, 0.7].map((at, i) => (
        <Sfx key={i} name="click" at={at} volume={0.3} />
      ))}
      <Camera seconds={seconds} from={1} to={1.04} origin="50% 40%">
        <div className="lower">
          <Eyebrow start={0.1}>Before</Eyebrow>
        </div>
        <div style={{ position: "absolute", left: 96, top: 200, width: 1744, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, fontSize: 22 }}>
          <Fade start={0.2} style={{ zoom: 1.6 }}>
            <StatTile label="Eval accuracy · golden v1 · release/1.3" value={pct(acc.estimate)} sub={`95% CI ${pct(acc.lo)} – ${pct(acc.hi)} on 400 cases`} tone="good" />
          </Fade>
          <Fade start={0.45} style={{ zoom: 1.6 }}>
            <StatTile label="Coverage · last 7 days vs golden v1" value={pct(snap.coverage_v1.coverage)} sub={`${snap.coverage_v1.covered} of ${snap.coverage_v1.total} traces within the golden set's neighbourhood`} tone="bad" />
          </Fade>
          <Fade start={0.7} style={{ zoom: 1.6 }}>
            <StatTile label="Analyst override rate · last 7 days" value={pct(over)} sub={`was ${pct(overBefore)} the week before the migration`} tone="bad" />
          </Fade>
        </div>
        <div style={{ position: "absolute", left: 96, top: 620 }}>
          <Kinetic text="Green dashboard. Unhappy customer." start={1.0} size={64} />
        </div>
      </Camera>
    </Scene>
  );
};

export const Harvest: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const t = useT();
  const graded = snap.grading.filter((g) => g.expert).slice(0, 12);
  const v2 = snap.golden_versions.find((v) => v.version === "v2")!;
  return (
    <Scene seconds={seconds}>
      {graded.map((_, i) => (
        <Sfx key={i} name="tick" at={0.55 + i * 0.12} volume={0.16} />
      ))}
      <Sfx name="ping" at={2.4} volume={0.3} />
      <Camera seconds={seconds} from={1} to={1.03} origin="40% 40%">
        <div className="lower">
          <Eyebrow start={0.1}>After</Eyebrow>
          <Kinetic text="30 cases graded. Not 400." start={0.2} size={48} />
        </div>
        <div style={{ position: "absolute", left: 96, top: 230, width: 1000, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {graded.map((g, i) => {
            const a = ramp(t, 0.3 + i * 0.12, 0.3);
            const stamp = ramp(t, 0.55 + i * 0.12, 0.25);
            return (
              <div key={g.item_id} className="window" style={{ opacity: a, transform: `translateY(${(1 - a) * 14}px)`, padding: "12px 14px", fontSize: 15 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-2)", fontSize: 13 }}>
                  <span>
                    <span className="dot" style={{ background: clusterColor(g.cluster_id), marginRight: 6 }} />
                    {g.trace_id}
                  </span>
                  <span>{g.role}</span>
                </div>
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                  <span className={`badge ${g.expert!.decision.toLowerCase()}`} style={{ opacity: stamp, transform: `scale(${0.7 + stamp * 0.3})`, fontSize: 14 }}>
                    {g.expert!.decision}
                  </span>
                  <span className="num" style={{ fontWeight: 600 }}>{g.expert!.decision === "APPROVE" ? `$${g.expert!.amount.toFixed(2)}` : ""}</span>
                  <span style={{ color: "var(--text-3)", fontSize: 12, marginLeft: "auto" }}>{g.expert!.grader.replace("analyst:", "")}</span>
                </div>
              </div>
            );
          })}
        </div>
        <Fade start={2.2} style={{ position: "absolute", left: 1150, top: 230, width: 690 }}>
          <Window title="Golden sets" width={690} bodyStyle={{ padding: "14px 18px" }}>
            <div style={{ fontSize: 15 }}>
              <VersionTimeline versions={snap.golden_versions} current="v2" />
            </div>
            <div style={{ fontSize: 14, color: "var(--text-2)" }}>
              {v2.case_ids.length} cases · sha-256 {v2.sha256.slice(0, 14)}… · exported as a Foundry evaluation dataset
            </div>
          </Window>
        </Fade>
      </Camera>
    </Scene>
  );
};

export const Blocked: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const t = useT();
  const run = snap.runs.r13_v2;
  const gate = snap.gates.r13_v2;
  const m = run.metrics!;
  return (
    <Scene seconds={seconds}>
      <Sfx name="riser" at={0.2} volume={0.3} />
      <Sfx name="buzz" at={2.6} volume={0.55} />
      <Sfx name="stamp" at={2.6} volume={0.7} />
      {gate.checks.map((c, i) => (
        <Sfx key={c.name} name={c.pass ? "tick" : "click"} at={1.4 + i * 0.4} volume={0.25} />
      ))}
      <Camera seconds={seconds} from={1} to={1.04} x={20} origin="30% 45%">
        <div className="lower">
          <Eyebrow start={0.1}>Release gate</Eyebrow>
          <Kinetic text="release/1.3 on golden v2" start={0.2} size={48} />
        </div>
        <Fade start={0.6} style={{ position: "absolute", left: 96, top: 230, width: 1000, fontSize: 22 }}>
          <Window title="checks" width={1000} bodyStyle={{ padding: "6px 18px" }}>
            <div style={{ fontSize: 17 }}>
              <GateChecks gate={gate} reveal={ramp(t, 1.2, 2.2, "linear")} />
            </div>
          </Window>
        </Fade>
        <div style={{ position: "absolute", left: 400, top: 720 }}>
          <Stamp at={2.6} color="var(--danger)" size={64} rotate={-5}>
            ✗ BLOCKED
          </Stamp>
        </div>
        <Fade start={1.0} style={{ position: "absolute", left: 1150, top: 230, width: 690 }}>
          <div style={{ fontSize: 22, color: "var(--text-2)" }}>accuracy on 430 cases</div>
          <div className="bigstat" style={{ color: "var(--danger)", fontSize: 120 }}>
            <Counter from={snap.baseline.run.metrics!.accuracy.estimate * 100} to={m.accuracy.estimate * 100} start={1.2} duration={1.2} format={(v) => `${v.toFixed(1)}%`} />
          </div>
          <div style={{ fontSize: 20, color: "var(--text-2)", marginBottom: 20 }}>
            95% CI {pct(m.accuracy.lo)} – {pct(m.accuracy.hi)}
          </div>
          <Window title="by blind spot (harvested cases)" width={690} bodyStyle={{ padding: "8px 18px" }}>
            <div style={{ fontSize: 17 }}>
              <SegmentBars segments={m.by_cluster} />
            </div>
          </Window>
        </Fade>
      </Camera>
      <Caption start={4.4}>
        Blocked, with the reason named: <b>0% on the portal-v2 cluster</b>. The 94% was about August.
      </Caption>
    </Scene>
  );
};

export const Fixed: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const t = useT();
  const run = snap.runs.r14;
  const gate = snap.gates.r14;
  const m = run.metrics!;
  const patch = snap.agent_versions.find((a) => a.version === "1.4.0")?.patch ?? "";
  return (
    <Scene seconds={seconds}>
      {Array.from({ length: 14 }, (_, i) => (
        <Sfx key={i} name="tick" at={0.6 + i * 0.14} volume={0.12} />
      ))}
      <Sfx name="whoosh" at={3.4} volume={0.3} />
      <Sfx name="riser" at={3.0} volume={0.25} />
      <Sfx name="ping" at={5.4} volume={0.55} />
      <Sfx name="stamp" at={5.4} volume={0.5} />
      <Camera seconds={seconds} from={1} to={1.04} x={-20} origin="70% 45%">
        <div className="lower">
          <Eyebrow start={0.1}>Fix · release/1.4</Eyebrow>
          <Kinetic text="A fourteen-line parser patch." start={0.2} size={48} />
        </div>
        <Fade start={0.4} style={{ position: "absolute", left: 96, top: 230, width: 860 }}>
          <div style={{ fontSize: 17 }}>
            <Patch patch={patch} reveal={ramp(t, 0.5, 2.2, "linear")} />
          </div>
        </Fade>
        <Fade start={3.4} style={{ position: "absolute", left: 1010, top: 230, width: 830, fontSize: 20 }}>
          <Window title="accuracy · paired delta vs release/1.3" width={830} bodyStyle={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 16, display: "grid", gap: 22 }}>
              <div>
                <div style={{ color: "var(--text-2)", marginBottom: 8 }}>accuracy</div>
                <IntervalBar interval={m.accuracy} min={0.8} max={1} tone="success" />
              </div>
              <div>
                <div style={{ color: "var(--text-2)", marginBottom: 8 }}>paired delta vs release/1.3 on the same 430 cases</div>
                {m.delta_vs_baseline ? <IntervalBar interval={m.delta_vs_baseline} min={-0.1} max={0.1} zero format="pts" tone="success" /> : null}
              </div>
              <SegmentBars segments={m.by_cluster} />
            </div>
          </Window>
        </Fade>
        <div style={{ position: "absolute", left: 1040, top: 660 }}>
          <Stamp at={5.4} color="var(--success)" size={54} rotate={-5}>
            ✓ PASS · coverage {pct(gate.coverage ?? 0)}
          </Stamp>
        </div>
      </Camera>
      <Caption start={6.4}>
        {pct(m.accuracy.estimate)}, <b>{m.delta_vs_baseline ? pts(m.delta_vs_baseline.estimate) : ""}</b> with the whole interval above zero. Coverage {pct(gate.coverage ?? 0)}. The honest number went down from 94 before it went up; that is the point.
      </Caption>
    </Scene>
  );
};

export const Control: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const t = useT();
  const run = snap.runs.r15;
  const gate = snap.gates.r15;
  const m = run.metrics!;
  const d = m.delta_vs_baseline!;
  return (
    <Scene seconds={seconds}>
      <Sfx name="whoosh" at={0.6} volume={0.25} />
      <Sfx name="ping" at={2.5} volume={0.35} />
      {gate.checks.map((_, i) => (
        <Sfx key={i} name="tick" at={3.0 + i * 0.25} volume={0.15} />
      ))}
      <Camera seconds={seconds} from={1} to={1.03} origin="40% 40%">
        <div className="lower">
          <Eyebrow start={0.1}>Control · release/1.5</Eyebrow>
          <Kinetic text="Does it cry wolf?" start={0.2} size={48} />
        </div>
        <Fade start={0.6} style={{ position: "absolute", left: 96, top: 250, width: 1100 }}>
          <Window title="paired delta vs release/1.4 on the same 430 cases" width={1100} bodyStyle={{ padding: "24px 28px" }}>
            <div style={{ fontSize: 22 }}>
              <IntervalBar interval={d} min={-0.06} max={0.06} zero format="pts" tone="accent" />
            </div>
            <div style={{ fontSize: 22, color: "var(--text-2)", marginTop: 22 }}>
              The next release moves the number by <b style={{ color: "var(--text)" }}>{pts(d.estimate)}</b>. The 95% interval [{pts(d.lo)}, {pts(d.hi)}] includes zero: at this sample size that is noise, so the gate does not fire.
            </div>
          </Window>
        </Fade>
        <div style={{ position: "absolute", left: 1290, top: 300 }}>
          <Stamp at={2.4} color="var(--success)" size={64} rotate={-5}>
            ✓ PASS
          </Stamp>
          <Fade start={2.9} style={{ fontSize: 22, color: "var(--text-2)", marginTop: 14 }}>
            release/1.5 on golden v2 · {pct(m.accuracy.estimate)} · 6 checks passed
          </Fade>
        </div>
        <Fade start={2.8} style={{ position: "absolute", left: 96, top: 530, width: 1744 }}>
          <Window title="gate checks · release/1.5 on golden v2" width={1744} bodyStyle={{ padding: "4px 18px" }}>
            <div style={{ fontSize: 17, columnCount: 2, columnGap: 40 }}>
              <GateChecks gate={gate} reveal={ramp(t, 3.0, 1.6, "linear")} />
            </div>
          </Window>
        </Fade>
      </Camera>
      <Caption start={4.2}>
        <b>No crying wolf.</b> A bare point estimate reads as a drop. The interval says it is noise.
      </Caption>
    </Scene>
  );
};

export const WhyMe: React.FC<{ seconds: number }> = ({ seconds }) => {
  const t = useT();
  const photo = ramp(t, 0.15, 0.7);
  return (
    <Scene seconds={seconds} grid={false}>
      <Sfx name="whoosh" at={0.1} volume={0.25} />
      <Sfx name="click" at={1.0} volume={0.3} />
      <Camera seconds={seconds} from={1.03} to={1} origin="35% 50%">
        <div style={{ position: "absolute", left: 160, top: 300, width: 400, height: 400, opacity: photo, transform: `scale(${0.92 + photo * 0.08})` }}>
          <div style={{ position: "absolute", inset: -14, borderRadius: "50%", border: "2px solid var(--accent)", opacity: 0.5 }} />
          <div style={{ position: "absolute", inset: -30, borderRadius: "50%", border: "1px solid var(--border-strong)", opacity: 0.6 }} />
          <div style={{ width: 400, height: 400, borderRadius: "50%", overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}>
            <Shot file="photo/headshot.jpeg" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
          <div style={{ position: "absolute", right: -18, bottom: 22, background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 999, padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "var(--text-2)" }}>
            <Logo size={22} /> Blindspot
          </div>
        </div>
        <div style={{ position: "absolute", left: 660, top: 300, maxWidth: 1180 }}>
          <Eyebrow start={0.4}>Who I am</Eyebrow>
          <div style={{ marginTop: 10 }}>
            <Kinetic text="I'm Ishita Samadhiya." start={0.5} size={80} />
          </div>
          <Fade start={1.6} style={{ fontSize: 32, color: "var(--text-2)", marginTop: 12 }}>
            EECS + Business · Berkeley M.E.T. · Class of 2028
          </Fade>
          <div style={{ marginTop: 40 }}>
            <Kinetic text="I like finding messy product problems, figuring out what actually matters, and building the system that fixes them." start={2.9} size={42} color="var(--text)" perWord={0.045} />
          </div>
        </div>
      </Camera>
    </Scene>
  );
};

const PROOF: Array<{ where: string; what: string; pinned: string }> = [
  { where: "MIT CSAIL", what: "owned retrieval + evaluation design for RAG across 12 health domains in production", pinned: "evaluation design and monitoring are things I already own" },
  { where: "FrontDesk", what: "customer interviews → a technical design through eng, design and CEO review → a shipped lead pipeline on durable workflows → iteration", pinned: "the trace → internal tool → gate shape" },
  { where: "Valency", what: "a 25-experiment benchmarking program with paired-bootstrap CIs and LLM-as-judge", pinned: "the interval on the score is my code" },
  { where: "Holographic Studio", what: "a vocal-cover recorder where hand gestures drive autotune, echo and volume, exported as one synced MP4", pinned: "existing idea → missing layer" },
  { where: "Founder", what: "Skinsnap, zero to 10,000+ users, acquired", pinned: "what “the customer says it's broken” costs" },
  { where: "Microsoft Delta", what: "here is the problem I would want to fix first", pinned: "" },
];

export const Proof: React.FC<{ seconds: number }> = ({ seconds }) => (
  <Scene seconds={seconds}>
    {PROOF.map((_, i) => (
      <Sfx key={i} name="click" at={0.3 + i * 1.6} volume={0.3} />
    ))}
    <Camera seconds={seconds} from={1} to={1.03} origin="50% 40%">
      <div className="lower">
        <Eyebrow start={0.1}>What I have built</Eyebrow>
      </div>
      <div style={{ position: "absolute", left: 96, top: 180, width: 1744 }} className="card-stack">
        {PROOF.map((p, i) => (
          <Fade key={p.where} start={0.3 + i * 1.6} y={16}>
            <div className="proofcard" style={p.where === "Microsoft Delta" ? { borderColor: "var(--accent)" } : undefined}>
              <span className="where">{p.where}</span>
              <span>
                <span className="arrow">→</span>
                {p.what}
                {p.pinned ? <span style={{ display: "block", color: "var(--text-3)", fontSize: 20, marginTop: 4 }}>↳ {p.pinned}</span> : null}
              </span>
            </div>
          </Fade>
        ))}
      </div>
    </Camera>
  </Scene>
);

export const Close: React.FC<{ seconds: number }> = ({ seconds }) => (
  <Scene seconds={seconds} grid={false}>
    <Sfx name="whoosh" at={3.4} volume={0.3} />
    <Sfx name="ping" at={3.6} volume={0.25} />
    <Camera seconds={seconds} from={1.02} to={1} origin="50% 50%">
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center" }}>
        <Kinetic text="We don't ship agents we can't measure." start={0.2} size={56} align="center" color="var(--text-2)" />
        <div style={{ marginTop: 16 }}>
          <Kinetic text="Blindspot keeps the measurement about this week." start={1.4} size={64} align="center" />
        </div>
      </div>
      <Fade start={3.4} className="endcard" style={{ top: 330 }}>
        <Logo size={64} />
        <div className="name">Ishita Samadhiya</div>
        <div className="sub">Berkeley M.E.T. · EECS + Business</div>
        <div className="sub" style={{ marginTop: 18, color: "var(--text)" }}>I'd love to build the next one with Team Delta.</div>
        <div className="links">
          <span>github.com/ishitasamadhiya/blindspot</span>
          <span>linkedin.com/in/ishitasamadhiya</span>
          <span>ishitasamadhiya.com</span>
        </div>
        <div style={{ fontSize: 20, color: "var(--text-3)", marginTop: 24 }}>npm run demo · offline · no keys required</div>
      </Fade>
    </Camera>
  </Scene>
);
