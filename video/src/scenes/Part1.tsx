import React from "react";
import { ClaimJson } from "@web/components/ClaimJson";
import { TrendChart } from "@web/components/TrendChart";
import { Caption, Code, Eyebrow, Fade, Kinetic, Scene, Terminal, Window } from "../components/Primitives";
import { clamp01, ramp, useT } from "../lib/anim";
import type { Snapshot } from "../data/types";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const Hook: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const t = useT();
  const spot = snap.blind_spots[0]!;
  const claim = spot.medoid.claim as { line_items?: Array<{ deduction: number }> };
  const claimed = (claim.line_items ?? []).reduce((s, li) => s + li.deduction, 0);
  const stamp = ramp(t, 1.4, 0.35);
  const acc = snap.baseline.run.metrics!.accuracy;
  return (
    <Scene seconds={seconds}>
      <Fade start={0.1} style={{ position: "absolute", left: 110, top: 120 }}>
        <Window title="Contoso Foods · deduction-claim validator · trace T-01668" width={760}>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 8 }}>Northwind Traders · received Oct 5, 4:10 PM · agent 1.3.0</div>
          <ClaimJson claim={spot.medoid.claim} maxHeight={430} style={{ fontSize: 15 }} highlight={["line_items", "export_version"]} />
        </Window>
      </Fade>
      <div style={{ position: "absolute", left: 560, top: 560, opacity: stamp, transform: `rotate(-6deg) scale(${0.6 + stamp * 0.4})`, transformOrigin: "center" }}>
        <div style={{ border: "4px solid var(--danger)", color: "var(--danger)", borderRadius: 12, padding: "10px 24px", fontSize: 54, fontWeight: 800, letterSpacing: "0.04em", background: "rgba(13,17,23,0.85)" }}>
          APPROVED · $0.00
        </div>
        <div style={{ color: "var(--text-2)", fontSize: 20, marginTop: 8, textAlign: "center" }}>claimed ${claimed.toFixed(2)} across {claim.line_items?.length ?? 0} line items</div>
      </div>
      <Fade start={3.5} style={{ position: "absolute", right: 120, top: 150, width: 740 }}>
        <div className="window">
          <div className="titlebar">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            <span className="t">Release gate · release/1.3 · golden v1</span>
          </div>
          <div className="body" style={{ padding: "28px 32px" }}>
            <div style={{ fontSize: 20, color: "var(--text-2)" }}>Eval accuracy · re-run on every release</div>
            <div style={{ fontSize: 120, fontWeight: 700, color: "var(--success)", letterSpacing: "-0.04em", lineHeight: 1.05 }}>{pct(acc.estimate)}</div>
            <div style={{ fontSize: 20, color: "var(--text-2)" }}>
              95% CI {pct(acc.lo)} – {pct(acc.hi)} on 400 expert-graded claims
            </div>
            <div style={{ marginTop: 18, display: "inline-flex", gap: 10, alignItems: "center", background: "var(--success-soft)", color: "var(--success)", padding: "8px 16px", borderRadius: 999, fontWeight: 700, fontSize: 22 }}>✓ PASS · 2 checks</div>
          </div>
        </div>
      </Fade>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 150, textAlign: "center" }}>
        <Kinetic text="Both are true." start={5.5} size={76} align="center" />
      </div>
      <Caption start={7.0}>
        If I joined <b>Team Delta</b> tomorrow, this is the first thing I'd fix.
      </Caption>
    </Scene>
  );
};

const Node: React.FC<{ x: number; y: number; at: number; title: string; sub?: string; tone?: "accent" | "danger" | "success" | "" }> = ({ x, y, at, title, sub, tone = "" }) => {
  const t = useT();
  const a = ramp(t, at, 0.4);
  return (
    <div className={`node ${tone}`} style={{ left: x, top: y, opacity: a, transform: `translateY(${(1 - a) * 16}px) scale(${0.96 + a * 0.04})` }}>
      {title}
      {sub ? <small>{sub}</small> : null}
    </div>
  );
};

const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; at: number; color?: string }> = ({ x1, y1, x2, y2, at, color = "var(--border-strong)" }) => {
  const t = useT();
  const a = ramp(t, at, 0.5, "inout");
  const x = x1 + (x2 - x1) * a;
  const y = y1 + (y2 - y1) * a;
  return (
    <svg style={{ position: "absolute", left: 0, top: 0 }} width={1920} height={1080}>
      <line x1={x1} y1={y1} x2={x} y2={y} stroke={color} strokeWidth={3} strokeLinecap="round" />
      {a > 0.95 ? <polygon points={`${x2},${y2} ${x2 - 14},${y2 - 7} ${x2 - 14},${y2 + 7}`} fill={color} transform={`rotate(${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI} ${x2} ${y2})`} /> : null}
    </svg>
  );
};

export const Works: React.FC<{ seconds: number }> = ({ seconds }) => (
  <Scene seconds={seconds}>
    <div className="lower">
      <Eyebrow start={0.2}>What already works</Eyebrow>
      <Kinetic text="Delta's evaluation harness." start={0.4} size={56} />
    </div>
    <Node x={150} y={470} at={0.9} title="Historical decisions" sub="analyst outcomes, Jun–Aug" />
    <Arrow x1={470} y1={505} x2={560} y2={505} at={1.5} />
    <Node x={575} y={455} at={1.8} title="Golden set v1" sub="400 claims · graded by 2 domain experts" tone="accent" />
    <Arrow x1={990} y1={505} x2={1080} y2={505} at={2.5} />
    <Node x={1095} y={470} at={2.8} title="Replay on every release" sub="accuracy, per-retailer, per-type" />
    <Arrow x1={1455} y1={505} x2={1545} y2={505} at={3.5} />
    <Node x={1560} y={470} at={3.8} title="Ship" sub="into the customer's tenant" tone="success" />
    <Caption start={4.6}>
      CI for agents. <b>The right idea.</b> The question is what it is blind to.
    </Caption>
  </Scene>
);

export const Signal: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const t = useT();
  const daily = snap.daily;
  const first = daily.slice(0, 7);
  const last = daily.slice(-7);
  const rate = (d: typeof daily) => d.reduce((s, x) => s + x.overrides, 0) / Math.max(1, d.reduce((s, x) => s + x.volume, 0));
  const reveal = ramp(t, 0.4, 3.2, "linear");
  return (
    <Scene seconds={seconds}>
      <div className="lower">
        <Eyebrow start={0.1}>Signal</Eyebrow>
        <Kinetic text="Three weeks after deployment." start={0.3} size={48} />
      </div>
      <Fade start={0.3} style={{ position: "absolute", left: 96, top: 250, width: 1180 }}>
        <Window title="Contoso Foods · production signals by day" width={1180}>
          <div style={{ fontSize: 15 }}>
            <TrendChart
              labels={daily.map((d) => day(d.day))}
              series={[
                { key: "override", label: "analyst override rate", color: "var(--danger)", values: daily.map((d) => (d.volume ? d.overrides / d.volume : 0)) },
                { key: "esc", label: "escalation rate", color: "var(--warning)", values: daily.map((d) => (d.volume ? d.escalations / d.volume : 0)) },
                { key: "zero", label: "$0 approvals", color: "var(--accent)", values: daily.map((d) => (d.volume ? d.zero_dollar_approvals / d.volume : 0)), dashed: true },
              ]}
              yMax={0.5}
              height={300}
              reveal={reveal}
              marker={reveal > 0.55 ? { index: 7, label: "Northwind portal v2 export goes live" } : undefined}
            />
          </div>
        </Window>
      </Fade>
      <Fade start={2.6} style={{ position: "absolute", right: 120, top: 330, textAlign: "right" }}>
        <div style={{ fontSize: 22, color: "var(--text-2)" }}>analyst override rate</div>
        <div style={{ fontSize: 44, color: "var(--text-2)", fontWeight: 600 }}>{pct(rate(first))}</div>
        <div style={{ fontSize: 110, fontWeight: 700, color: "var(--danger)", letterSpacing: "-0.04em", lineHeight: 1 }}>{pct(rate(last))}</div>
        <div style={{ fontSize: 22, color: "var(--text-2)", marginTop: 10 }}>eval on golden v1: still {pct(snap.baseline.run.metrics!.accuracy.estimate)}</div>
      </Fade>
      <Caption start={3.8}>
        Analysts override <b>1 in 4</b> decisions. The eval never moved.
      </Caption>
    </Scene>
  );
};

export const Hypothesis: React.FC<{ seconds: number }> = ({ seconds }) => {
  const t = useT();
  const strike = ramp(t, 1.4, 0.5, "inout");
  return (
    <Scene seconds={seconds}>
      <div style={{ position: "absolute", left: 160, top: 300 }}>
        <Eyebrow start={0.1}>Signal → hypothesis</Eyebrow>
        <div style={{ position: "relative", display: "inline-block", marginTop: 20 }}>
          <Kinetic text="Is the agent right?" start={0.3} size={58} color="var(--text-2)" />
          <div style={{ position: "absolute", left: 0, top: "54%", height: 5, width: `${strike * 100}%`, background: "var(--danger)", borderRadius: 3 }} />
        </div>
        <div style={{ marginTop: 34, maxWidth: 1500 }}>
          <Kinetic text="How much of this week's traffic has the eval actually seen?" start={2.0} size={74} />
        </div>
      </div>
      <Caption start={3.4}>
        The golden set was built in <b>August</b>. The traffic changed in <b>October</b>.
      </Caption>
    </Scene>
  );
};

export const Measure: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const t = useT();
  const cov = snap.coverage_v1;
  const big = ramp(t, 3.6, 0.5);
  const count = Math.round(cov.coverage * 1000 * clamp01((t - 3.6) / 0.9)) / 10;
  return (
    <Scene seconds={seconds}>
      <div className="lower">
        <Eyebrow start={0.1}>Experiment</Eyebrow>
        <Kinetic text="Measure it." start={0.3} size={48} />
      </div>
      <div style={{ position: "absolute", left: 96, top: 250 }}>
        <Terminal
          width={1080}
          lines={[
            { text: "npx blindspot coverage --window 7d --golden v1", cls: "p", at: 0.4 },
            { text: `load window         ${cov.total} traces, 400 golden cases`, cls: "dim", at: 1.7 },
            { text: `embed claims        ${cov.total + 400} vectors via hashing-v1 (384-d)`, cls: "dim", at: 2.1 },
            { text: `calibrate threshold ${cov.threshold.toFixed(3)}  (5th pct of golden self-similarity)`, cls: "dim", at: 2.6 },
            { text: `score coverage      ${cov.covered}/${cov.total} covered = ${pct(cov.coverage)}`, cls: "bad", at: 3.3 },
            { text: `cluster uncovered   ${cov.analysis.blind_spots.length} blind spots above the reporting floor`, cls: "ok", at: 4.6 },
          ]}
        />
      </div>
      <div style={{ position: "absolute", right: 130, top: 300, textAlign: "right", opacity: big, transform: `translateY(${(1 - big) * 20}px)` }}>
        <div className="bigstat" style={{ color: "var(--danger)" }}>{count.toFixed(1)}%</div>
        <div style={{ fontSize: 24, color: "var(--text-2)", marginTop: 12, maxWidth: 560 }}>of last week's traffic sits inside the golden set's own neighbourhood</div>
      </div>
      <Caption start={5.2}>
        Half the traffic has <b>no neighbour</b> in the eval. Covered is defined by the golden set itself, not a magic number.
      </Caption>
    </Scene>
  );
};

export const CODE_COVERAGE = [
  { text: "// covered = at least as close to a golden case as 95%" },
  { text: "// of the golden set is to itself (held-out slice)" },
  { text: "export function calibrateThreshold(golden: Vec[]) {" },
  { text: "  const [hold, rest] = splitHoldout(golden, 0.2, seed);" },
  { text: "  const sims = hold.map((v) => nearest(v, rest).similarity);" },
  { text: "  return quantile(sims, 0.05);", hl: true },
  { text: "}" },
  { text: "" },
  { text: "export function computeCoverage(traces, golden, threshold) {" },
  { text: "  return traces.map((t) => {" },
  { text: "    const n = nearest(t.vec, golden);" },
  { text: "    return { ...n, covered: n.similarity >= threshold };", hl: true },
  { text: "  });" },
  { text: "}" },
];

export { Code };
