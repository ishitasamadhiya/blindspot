import React from "react";
import { ClaimJson } from "@web/components/ClaimJson";
import { CoverageMap, clusterColor } from "@web/components/CoverageMap";
import { Eyebrow, Fade, Kinetic, Scene, Shot, Window } from "../components/Primitives";
import { Camera, Counter, ScanLine, Sfx, Stamp, Ticker } from "../components/Motion";
import { ramp, useT } from "../lib/anim";
import type { Snapshot } from "../data/types";

/** Thirty seconds of what I would do at Delta. The avatar sits small in the bottom-left corner, so these scenes keep that corner clear. */
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const pts = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} pts`;

export const Notice: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const spot = snap.blind_spots[0]!;
  const claim = spot.medoid.claim as { line_items?: Array<{ deduction: number }> };
  const claimed = (claim.line_items ?? []).reduce((s, li) => s + li.deduction, 0);
  const acc = snap.baseline.run.metrics!.accuracy;
  const feed = (snap.ticker ?? [])
    .slice(-7)
    .map((tr) => ({ id: tr.trace_id, retailer: (tr.claim as { retailer: string }).retailer, decision: tr.output.decision, amount: `$${tr.output.amount.toFixed(2)}`, tone: tr.output.decision.toLowerCase() as "approve" | "reject" | "escalate" }));
  feed.push({ id: spot.medoid.trace_id, retailer: (spot.medoid.claim as { retailer: string }).retailer, decision: spot.medoid.output.decision, amount: `$${spot.medoid.output.amount.toFixed(2)}`, tone: "approve" });
  const freeze = 1.6;
  const tileIn = 4.2;
  return (
    <Scene seconds={seconds}>
      <Sfx name="whoosh" at={0.1} volume={0.35} />
      {feed.map((_, i) => (i < 8 ? <Sfx key={i} name="tick" at={0.3 + i * 0.14} volume={0.18} /> : null))}
      <Sfx name="stamp" at={freeze + 0.9} volume={0.8} />
      <Sfx name="whoosh" at={tileIn} volume={0.3} />
      <Camera seconds={seconds} from={1} to={1.04} y={-8} origin="45% 40%">
        <Fade start={0.1} out={freeze} style={{ position: "absolute", left: 96, top: 100 }}>
          <div style={{ fontSize: 15, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 }}>From the field · Contoso Foods · deduction-claim validator · live decisions · Oct 5</div>
          <Ticker rows={feed} start={0.3} every={0.14} width={820} highlightLast />
        </Fade>
        <Fade start={freeze} style={{ position: "absolute", left: 96, top: 100, width: 820 }} y={0}>
          <Window title={`trace ${spot.medoid.trace_id} · Northwind Traders · agent 1.3.0`} width={820}>
            <ClaimJson claim={spot.medoid.claim} maxHeight={400} style={{ fontSize: 15 }} highlight={["line_items", "export_version"]} />
          </Window>
        </Fade>
        <div style={{ position: "absolute", left: 440, top: 600 }}>
          <Stamp at={freeze + 0.9} color="var(--danger)">APPROVED · $0.00</Stamp>
          <Fade start={freeze + 1.3} out={6.1} style={{ color: "var(--text-2)", fontSize: 22, marginTop: 10, textAlign: "center" }}>
            claimed ${claimed.toFixed(2)} across {claim.line_items?.length ?? 0} line items
          </Fade>
        </div>
      </Camera>
      <Fade start={tileIn} style={{ position: "absolute", right: 110, top: 140, width: 740 }} y={24}>
        <Window title="Release gate · release/1.3 · golden v1" width={740} bodyStyle={{ padding: "28px 32px" }}>
          <div style={{ fontSize: 24, color: "var(--text-2)" }}>Eval accuracy, re-run on every release</div>
          <div style={{ fontSize: 104, fontWeight: 700, color: "var(--success)", letterSpacing: "-0.035em", lineHeight: 1.05 }}>
            <Counter from={0} to={acc.estimate * 100} start={tileIn + 0.1} duration={1.1} format={(v) => `${v.toFixed(1)}%`} />
          </div>
          <div style={{ fontSize: 22, color: "var(--text-2)" }}>
            95% CI {pct(acc.lo)} – {pct(acc.hi)} on 400 expert-graded claims · PASS
          </div>
        </Window>
      </Fade>
      <div style={{ position: "absolute", left: 1000, top: 760, width: 800 }}>
        <Kinetic text="Both were true." start={6.3} size={78} />
      </div>
    </Scene>
  );
};

export const Coverage: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const t = useT();
  const cov = snap.coverage_v1;
  const reveal = ramp(t, 0.3, 2.4, "linear");
  const big = ramp(t, 1.2, 0.5);
  const spots = cov.analysis.blind_spots.slice(0, 3);
  return (
    <Scene seconds={seconds}>
      {[0.4, 0.55, 0.7, 0.85, 1.0, 1.15].map((at, i) => (
        <Sfx key={i} name="tick" at={at} volume={0.12} />
      ))}
      <Sfx name="buzz" at={1.3} volume={0.4} />
      {spots.map((_, i) => (
        <Sfx key={`c${i}`} name="click" at={4.6 + i * 0.8} volume={0.25} />
      ))}
      <Camera seconds={seconds} from={1} to={1.03} origin="55% 40%">
        <Fade start={0.1} style={{ position: "absolute", left: 420, top: 90 }}>
          <Window title="Blindspot · traffic map · last 7 days vs golden v1" width={980} bodyStyle={{ padding: 14 }}>
            <div style={{ fontSize: 13, position: "relative" }}>
              <CoverageMap points={cov.analysis.map} blindSpots={cov.analysis.blind_spots} width={940} height={470} reveal={reveal} showLabels />
              <div style={{ position: "absolute", left: 0, top: 0, width: 940, height: 470, overflow: "hidden", pointerEvents: "none" }}>
                <ScanLine at={0.5} duration={2.4} width={940} height={470} />
              </div>
            </div>
          </Window>
        </Fade>
        <div style={{ position: "absolute", left: 1440, top: 200, width: 420, opacity: big, transform: `translateY(${(1 - big) * 20}px)` }}>
          <div className="bigstat" style={{ color: "var(--danger)", fontSize: 112 }}>
            <Counter from={100} to={cov.coverage * 100} start={1.2} duration={1.3} format={(v) => `${v.toFixed(1)}%`} />
          </div>
          <div style={{ fontSize: 25, color: "var(--text-2)", marginTop: 12, lineHeight: 1.3 }}>of that week's traffic sits inside the golden set's own neighbourhood</div>
        </div>
        <div style={{ position: "absolute", left: 420, top: 650, width: 1400 }}>
          <Eyebrow start={4.4}>Blind spots, named from the uncovered traffic</Eyebrow>
          <div style={{ display: "flex", gap: 22, marginTop: 14 }}>
            {spots.map((b, i) => (
              <Fade key={b.cluster_id} start={4.6 + i * 0.8} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, fontFamily: "JetBrains Mono, monospace", padding: "10px 16px", border: "1px solid var(--border-strong)", borderRadius: 10, background: "var(--surface)" }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: clusterColor(b.cluster_id), flex: "none" }} />
                {b.name}
                <span style={{ color: "var(--text-3)" }}>n={b.volume}</span>
              </Fade>
            ))}
          </div>
        </div>
      </Camera>
    </Scene>
  );
};

const Check: React.FC<{ at: number; text: string; threshold: string }> = ({ at, text, threshold }) => (
  <Fade start={at} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 18, alignItems: "center", padding: "16px 0", borderTop: "1px solid var(--border)", fontSize: 28 }}>
    <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--success-soft)", color: "var(--success)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 20 }}>✓</span>
    <span>{text}</span>
    <span style={{ color: "var(--text-2)", fontFamily: "JetBrains Mono, monospace", fontSize: 22 }}>{threshold}</span>
  </Fade>
);

export const Moves: React.FC<{ seconds: number }> = ({ seconds }) => (
  <Scene seconds={seconds}>
    <Sfx name="click" at={0.4} volume={0.25} />
    {[4.2, 5.4, 6.6].map((at, i) => (
      <Sfx key={i} name="tick" at={at} volume={0.25} />
    ))}
    <Sfx name="ping" at={7.7} volume={0.3} />
    <div style={{ position: "absolute", left: 420, top: 110, width: 1400 }}>
      <Eyebrow start={0.1}>Grade ten, not a thousand</Eyebrow>
      <div style={{ marginTop: 10 }}>
        <Kinetic text="Ten cases per blind spot: the typical claim, its neighbours, random draws, and the ones the judge got wrong." start={0.3} size={44} perWord={0.045} />
      </div>
      <div style={{ marginTop: 44 }}>
        <Eyebrow start={3.4}>Then gate the release</Eyebrow>
      </div>
      <div style={{ marginTop: 12 }}>
        <Check at={4.2} text="Coverage of the last 7 days" threshold="≥ 85%" />
        <Check at={5.4} text="Every harvested blind spot" threshold="≥ 80%" />
        <Check at={6.6} text="No regression against the previous run" threshold="paired bootstrap, 10,000 resamples" />
      </div>
      <Fade start={7.7} style={{ marginTop: 26, fontFamily: "JetBrains Mono, monospace", fontSize: 24, color: "var(--text-2)" }}>
        <span style={{ color: "var(--accent)" }}>$</span> npm run gate <span style={{ color: "var(--text-3)" }}># exit 0 on PASS, 1 on BLOCKED · straight into CI</span>
      </Fade>
    </div>
  </Scene>
);

export const Result: React.FC<{ seconds: number; snap: Snapshot }> = ({ seconds, snap }) => {
  const r13 = snap.runs.r13_v2.metrics!;
  const r14 = snap.runs.r14.metrics!;
  const failing = snap.gates.r13_v2.checks.filter((c) => !c.pass);
  const cardIn = 6.5;
  return (
    <Scene seconds={seconds} grid={false}>
      <Sfx name="buzz" at={0.9} volume={0.5} />
      <Sfx name="stamp" at={0.9} volume={0.6} />
      <Sfx name="riser" at={3.0} volume={0.25} />
      <Sfx name="ping" at={4.8} volume={0.5} />
      <Sfx name="stamp" at={4.8} volume={0.45} />
      <Sfx name="whoosh" at={cardIn} volume={0.3} />
      <Fade start={0} out={cardIn - 0.2} style={{ position: "absolute", left: 420, top: 120, width: 1400, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60 }}>
        <div>
          <Eyebrow start={0.2}>release/1.3 on golden v2</Eyebrow>
          <div style={{ marginTop: 24, height: 150 }}>
            <Stamp at={0.9} color="var(--danger)" size={60} rotate={-5}>
              ✗ BLOCKED
            </Stamp>
          </div>
          <Fade start={1.3} style={{ fontSize: 30, marginTop: 10 }}>
            <div>
              <b style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--danger)" }}>{pct(r13.accuracy.estimate)}</b>
              <span style={{ color: "var(--text-2)", marginLeft: 14 }}>on 430 cases</span>
            </div>
            {failing.map((c) => (
              <div key={c.name} style={{ fontSize: 19, color: "var(--text-2)", marginTop: 8, fontFamily: "JetBrains Mono, monospace" }}>
                ✗ {c.name.replace("blind spot: ", "")} · {c.detail}
              </div>
            ))}
          </Fade>
        </div>
        <div>
          <Fade start={3.3}>
            <Eyebrow start={3.3}>A 14-line parser patch · release/1.4</Eyebrow>
          </Fade>
          <div style={{ marginTop: 24, height: 150 }}>
            <Stamp at={4.8} color="var(--success)" size={60} rotate={-5}>
              ✓ PASS
            </Stamp>
          </div>
          <Fade start={5.2} style={{ fontSize: 30, marginTop: 10 }}>
            <div>
              <b style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--success)" }}>{pct(r14.accuracy.estimate)}</b>
              <span style={{ color: "var(--text-2)", marginLeft: 14 }}>{r14.delta_vs_baseline ? `${pts(r14.delta_vs_baseline.estimate)} [${pts(r14.delta_vs_baseline.lo)}, ${pts(r14.delta_vs_baseline.hi)}]` : ""}</span>
            </div>
            <div style={{ fontSize: 24, color: "var(--text-2)", marginTop: 8 }}>whole interval above zero · coverage {pct(snap.gates.r14.coverage ?? 0)}</div>
          </Fade>
        </div>
      </Fade>
      <Fade start={cardIn} className="endcard" style={{ top: 40 }}>
        <div style={{ width: 150, height: 150, borderRadius: "50%", overflow: "hidden", marginBottom: 10 }}>
          <Shot file="photo/headshot.jpeg" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
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
    </Scene>
  );
};
