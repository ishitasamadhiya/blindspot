import React from "react";
import { ClaimJson } from "@web/components/ClaimJson";
import { TrendChart } from "@web/components/TrendChart";
import { Caption, Code, Eyebrow, Fade, Kinetic, Scene, Terminal, Window } from "../components/Primitives";
import { Camera, Counter, Sfx, Stamp, Ticker } from "../components/Motion";
import { clamp01, ramp, useT } from "../lib/anim";
import type { Snapshot } from "../data/types";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const Hook: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const t = useT();
  const spot = snap.blind_spots[0]!;
  const claim = spot.medoid.claim as { line_items?: Array<{ deduction: number }> };
  const claimed = (claim.line_items ?? []).reduce((s, li) => s + li.deduction, 0);
  const acc = snap.baseline.run.metrics!.accuracy;
  const feed = (snap.ticker ?? [])
    .slice(-7)
    .map((tr) => ({ id: tr.trace_id, retailer: (tr.claim as { retailer: string }).retailer, decision: tr.output.decision, amount: `$${tr.output.amount.toFixed(2)}`, tone: tr.output.decision.toLowerCase() as "approve" | "reject" | "escalate" }));
  feed.push({ id: spot.medoid.trace_id, retailer: (spot.medoid.claim as { retailer: string }).retailer, decision: spot.medoid.output.decision, amount: `$${spot.medoid.output.amount.toFixed(2)}`, tone: "approve" });
  const freeze = 1.9;
  const tileIn = 5.2;
  return (
    <Scene seconds={seconds}>
      <Sfx name="whoosh" at={0.1} volume={0.35} />
      {feed.map((_, i) => (i < 8 ? <Sfx key={i} name="tick" at={0.35 + i * 0.16} volume={0.18} /> : null))}
      <Sfx name="stamp" at={freeze + 0.9} volume={0.8} />
      <Sfx name="whoosh" at={tileIn} volume={0.3} />
      <Camera seconds={seconds} from={1} to={1.05} y={-10} origin="35% 45%">
        <Fade start={0.1} style={{ position: "absolute", left: 96, top: 110 }}>
          <div style={{ fontSize: 15, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 }}>From the field · Contoso Foods · deduction-claim validator · live decisions · Oct 5</div>
          <Ticker rows={feed} start={0.3} every={0.16} width={820} highlightLast />
        </Fade>
        <Fade start={freeze} style={{ position: "absolute", left: 96, top: 110, width: 820 }} y={0}>
          <Window title={`trace ${spot.medoid.trace_id} · Northwind Traders · agent 1.3.0`} width={820}>
            <ClaimJson claim={spot.medoid.claim} maxHeight={420} style={{ fontSize: 15 }} highlight={["line_items", "export_version"]} />
          </Window>
        </Fade>
        <div style={{ position: "absolute", left: 420, top: 540 }}>
          <Stamp at={freeze + 0.9} color="var(--danger)">APPROVED · $0.00</Stamp>
          <Fade start={freeze + 1.3} style={{ color: "var(--text-2)", fontSize: 22, marginTop: 10, textAlign: "center" }}>
            claimed ${claimed.toFixed(2)} across {claim.line_items?.length ?? 0} line items
          </Fade>
        </div>
      </Camera>
      <Fade start={tileIn} style={{ position: "absolute", right: 110, top: 150, width: 740 }} y={24}>
        <div className="window">
          <div className="titlebar">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            <span className="t">Release gate · release/1.3 · golden v1</span>
          </div>
          <div className="body" style={{ padding: "28px 32px" }}>
            <div style={{ fontSize: 20, color: "var(--text-2)" }}>Eval accuracy · re-run on every release</div>
            <div style={{ fontSize: 120, fontWeight: 700, color: "var(--success)", letterSpacing: "-0.04em", lineHeight: 1.05 }}>
              <Counter from={0} to={acc.estimate * 100} start={tileIn + 0.1} duration={1.1} format={(v) => `${v.toFixed(1)}%`} />
            </div>
            <div style={{ fontSize: 20, color: "var(--text-2)" }}>
              95% CI {pct(acc.lo)} – {pct(acc.hi)} on 400 expert-graded claims
            </div>
            <Fade start={tileIn + 1.0} style={{ marginTop: 18, display: "inline-flex", gap: 10, alignItems: "center", background: "var(--success-soft)", color: "var(--success)", padding: "8px 16px", borderRadius: 999, fontWeight: 700, fontSize: 22 }}>
              ✓ PASS · 2 checks
            </Fade>
          </div>
        </div>
      </Fade>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 165, textAlign: "center" }}>
        <Kinetic text="Both are true." start={7.0} size={78} align="center" />
      </div>
      <Caption start={8.4}>
        If I joined <b>Team Delta</b> tomorrow, this is the first thing I'd want to fix.
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
    {[0.9, 1.8, 2.8, 3.8].map((at, i) => (
      <Sfx key={i} name="click" at={at} volume={0.35} />
    ))}
    <Camera seconds={seconds} from={1.02} to={1} origin="50% 50%">
      <div className="lower">
        <Eyebrow start={0.2}>What already works · Delta's forward-deployed engineers</Eyebrow>
        <Kinetic text="Embedded with the customer, every engagement starts the same way." start={0.4} size={52} />
      </div>
      <Node x={120} y={470} at={0.9} title="Embed with the customer" sub="FDEs working inside the customer's business" />
      <Arrow x1={520} y1={505} x2={585} y2={505} at={1.5} />
      <Node x={600} y={470} at={1.8} title="Discovery" sub="find the decisions that matter" />
      <Arrow x1={905} y1={505} x2={965} y2={505} at={2.5} />
      <Node x={980} y={470} at={2.8} title="Golden set v1" sub="expert-graded, from real historical cases" tone="accent" />
      <Arrow x1={1385} y1={505} x2={1445} y2={505} at={3.5} />
      <Node x={1460} y={470} at={3.8} title="Replay on every release" sub="CI for the agent" tone="success" />
    </Camera>
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
  const reveal = ramp(t, 0.4, 3.0, "linear");
  return (
    <Scene seconds={seconds}>
      <Sfx name="riser" at={0.6} volume={0.35} />
      <Sfx name="buzz" at={3.1} volume={0.5} />
      <Camera seconds={seconds} from={1} to={1.04} x={-20} origin="40% 50%">
        <div className="lower">
          <Eyebrow start={0.1}>Signal</Eyebrow>
          <Kinetic text="Three weeks after go-live." start={0.3} size={48} />
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
      </Camera>
      <Fade start={2.4} style={{ position: "absolute", right: 120, top: 330, textAlign: "right" }}>
        <div style={{ fontSize: 22, color: "var(--text-2)" }}>analyst override rate</div>
        <div style={{ fontSize: 44, color: "var(--text-2)", fontWeight: 600 }}>{pct(rate(first))}</div>
        <div style={{ fontSize: 110, fontWeight: 700, color: "var(--danger)", letterSpacing: "-0.04em", lineHeight: 1 }}>
          <Counter from={rate(first) * 100} to={rate(last) * 100} start={2.6} duration={1.4} format={(v) => `${v.toFixed(1)}%`} />
        </div>
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
      <Sfx name="tick" at={1.4} volume={0.4} />
      <Sfx name="whoosh" at={2.0} volume={0.3} />
      <Camera seconds={seconds} from={1} to={1.06} origin="30% 50%">
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
      </Camera>
      <Caption start={3.6}>
        The golden set was built in <b>August</b>. The traffic changed at the <b>end of September</b>.
      </Caption>
    </Scene>
  );
};

export const Measure: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const t = useT();
  const cov = snap.coverage_v1;
  const big = ramp(t, 3.6, 0.5);
  return (
    <Scene seconds={seconds}>
      {[0.4, 0.55, 0.7, 0.85, 1.0, 1.15, 1.3, 1.45].map((at, i) => (
        <Sfx key={i} name="tick" at={at} volume={0.12} />
      ))}
      {[1.7, 2.1, 2.6].map((at, i) => (
        <Sfx key={`l${i}`} name="click" at={at} volume={0.25} />
      ))}
      <Sfx name="buzz" at={3.4} volume={0.45} />
      <Sfx name="click" at={4.6} volume={0.3} />
      <Camera seconds={seconds} from={1} to={1.03} origin="40% 40%">
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
      </Camera>
      <div style={{ position: "absolute", right: 130, top: 300, textAlign: "right", opacity: big, transform: `translateY(${(1 - big) * 20}px)` }}>
        <div className="bigstat" style={{ color: "var(--danger)" }}>
          <Counter from={100} to={cov.coverage * 100} start={3.6} duration={1.3} format={(v) => `${v.toFixed(1)}%`} />
        </div>
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
void clamp01;
