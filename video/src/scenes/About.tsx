import React from "react";
import { Eyebrow, Fade, Kinetic, Scene } from "../components/Primitives";
import { Counter, Sfx, Stamp } from "../components/Motion";

/** The minute about me: the avatar speaks on the left, these columns sit on the right. */
const COL: React.CSSProperties = { position: "absolute", left: 840, top: 150, width: 1000 };

const Row: React.FC<{ at: number; label: string; children: React.ReactNode }> = ({ at, label, children }) => (
  <Fade start={at} style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 24, padding: "18px 0", borderTop: "1px solid var(--border)", fontSize: 28, lineHeight: 1.3, alignItems: "baseline" }}>
    <span style={{ fontSize: 16, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 600 }}>{label}</span>
    <span>{children}</span>
  </Fade>
);

export const Hi: React.FC<{ seconds: number }> = ({ seconds }) => (
  <Scene seconds={seconds} grid={false}>
    <Sfx name="riser" at={0.1} volume={0.26} />
    <Sfx name="click" at={1.3} volume={0.3} />
    <div style={COL}>
      <Eyebrow start={1.0}>Who I am</Eyebrow>
      <div style={{ marginTop: 10 }}>
        <Kinetic text="Ishita Samadhiya" start={1.2} size={84} />
      </div>
      <Fade start={2.3} style={{ fontSize: 30, color: "var(--text-2)", marginTop: 12 }}>
        EECS + Business · Berkeley M.E.T. · Class of 2028
      </Fade>
      <Fade start={4.2} style={{ fontSize: 30, color: "var(--text-2)", marginTop: 6 }}>
        Two-time founder · one exit
      </Fade>
      <div style={{ marginTop: 44 }}>
        <Kinetic text="I find the pain point nobody has measured, and I build the fix." start={6.3} size={44} perWord={0.05} />
      </div>
    </div>
  </Scene>
);

const HOW = [
  "Start where the dashboard and the people disagree.",
  "Talk to whoever does the work.",
  "Measure what nobody measures.",
  "Build the smallest system that changes the decision.",
  "Ship it with proof.",
];
const HOW_AT = [0.2, 2.0, 3.8, 5.4, 7.2];

export const How: React.FC<{ seconds: number }> = ({ seconds }) => (
  <Scene seconds={seconds} grid={false}>
    {HOW_AT.map((at, i) => (
      <Sfx key={i} name="click" at={at} volume={0.22} />
    ))}
    <div style={COL}>
      <Eyebrow start={0.1}>How I work</Eyebrow>
      <div style={{ marginTop: 18 }}>
        {HOW.map((line, i) => (
          <Fade key={line} start={HOW_AT[i]!} style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.2, padding: "16px 0", borderTop: i ? "1px solid var(--border)" : "none", color: i === HOW.length - 1 ? "var(--accent)" : "var(--text)" }}>
            {line}
          </Fade>
        ))}
      </div>
    </div>
  </Scene>
);

export const FrontDesk: React.FC<{ seconds: number }> = ({ seconds }) => (
  <Scene seconds={seconds} grid={false}>
    {[2.6, 5.4, 7.8].map((at, i) => (
      <Sfx key={i} name="click" at={at} volume={0.24} />
    ))}
    <div style={COL}>
      <Eyebrow start={0.1}>FrontDesk · AI phone receptionist for small businesses · summer 2026</Eyebrow>
      <div style={{ marginTop: 10 }}>
        <Kinetic text="Leads found by hand → one click." start={0.3} size={56} />
      </div>
      <div style={{ marginTop: 34 }}>
        <Row at={2.6} label="Shipped">An outbound lead pipeline on durable workflows, adopted by the whole sales team</Row>
        <Row at={5.4} label="Heard">Customer interviews → context cards on live calls, which rival dialers lacked</Row>
        <Row at={7.8} label="Designed">A technical design carried through eng, design and the CEO → two product lines, built end to end</Row>
      </div>
    </div>
  </Scene>
);

export const Valency: React.FC<{ seconds: number }> = ({ seconds }) => (
  <Scene seconds={seconds} grid={false}>
    <Sfx name="click" at={2.6} volume={0.24} />
    {Array.from({ length: 10 }, (_, i) => (
      <Sfx key={i} name="tick" at={5.6 + i * 0.1} volume={0.1} />
    ))}
    <Sfx name="buzz" at={7.4} volume={0.35} />
    <Sfx name="ping" at={8.7} volume={0.35} />
    <Sfx name="click" at={12.2} volume={0.24} />
    <div style={COL}>
      <Eyebrow start={0.1}>Valency · AI research intern · 2026</Eyebrow>
      <div style={{ marginTop: 10 }}>
        <Kinetic text="Which personalization actually wins?" start={0.3} size={56} />
      </div>
      <Fade start={2.6} style={{ fontSize: 28, color: "var(--text-2)", marginTop: 18, lineHeight: 1.3 }}>
        25 experiments across 6 public datasets · a paired-bootstrap interval on every result
      </Fade>
      <div style={{ marginTop: 34, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
        <Fade start={5.6} style={{ padding: "22px 26px", borderTop: "3px solid var(--border-strong)" }}>
          <div style={{ fontSize: 22, color: "var(--text-2)" }}>tuned weight configurations</div>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>
            <Counter from={0} to={630} start={5.7} duration={1.2} format={(v) => `${Math.round(v)}`} />
          </div>
          <div style={{ marginTop: 10, height: 64 }}>
            <Stamp at={7.4} color="var(--danger)" size={40} rotate={-4}>
              0 wins
            </Stamp>
          </div>
        </Fade>
        <Fade start={8.6} style={{ padding: "22px 26px", borderTop: "3px solid var(--success)" }}>
          <div style={{ fontSize: 22, color: "var(--text-2)" }}>pooled user memory, no dial</div>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>30 / 30</div>
          <div style={{ fontSize: 22, color: "var(--text-2)", marginTop: 10 }}>cells of the mixed-scale grid</div>
        </Fade>
      </div>
      <Fade start={10.2} style={{ fontSize: 30, marginTop: 30, fontWeight: 600 }}>
        Recommended the simplest baseline, with the interval that proves it.
      </Fade>
      <Fade start={12.2} style={{ fontSize: 24, color: "var(--text-2)", marginTop: 10 }}>
        Cited in a NeurIPS 2026 workshop paper (LOCUS).
      </Fade>
    </div>
  </Scene>
);

export const Csail: React.FC<{ seconds: number }> = ({ seconds }) => (
  <Scene seconds={seconds} grid={false}>
    {[2.4, 4.6, 6.6].map((at, i) => (
      <Sfx key={i} name="click" at={at} volume={0.24} />
    ))}
    <div style={COL}>
      <Eyebrow start={0.1}>MIT CSAIL · Kellis Lab · AI research team lead · since 2024</Eyebrow>
      <div style={{ marginTop: 10 }}>
        <Kinetic text="RAG in production across 12 health domains." start={0.3} size={56} />
      </div>
      <div style={{ marginTop: 34 }}>
        <Row at={2.4} label="Lead">The deployment team</Row>
        <Row at={4.6} label="Own">Retrieval and evaluation design</Row>
        <Row at={6.6} label="Watch">Monitoring for latency, throughput and anomalies: the thing that says it still works</Row>
      </div>
    </div>
  </Scene>
);

export const Holo: React.FC<{ seconds: number }> = ({ seconds }) => (
  <Scene seconds={seconds} grid={false}>
    <Sfx name="click" at={2.2} volume={0.24} />
    <Sfx name="whoosh" at={6.1} volume={0.3} />
    <Sfx name="ping" at={7.6} volume={0.3} />
    <div style={COL}>
      <Eyebrow start={0.1}>Holographic Studio · 2026 · open source</Eyebrow>
      <div style={{ marginTop: 10 }}>
        <Kinetic text="An idea that already worked, plus its missing layer." start={0.3} size={56} />
      </div>
      <Fade start={2.2} style={{ fontSize: 28, color: "var(--text-2)", marginTop: 18, lineHeight: 1.35 }}>
        A vocal-cover recorder where hand gestures drive autotune, echo and volume while you sing, exported as one synced video.
      </Fade>
      <div style={{ marginTop: 56 }}>
        <Kinetic text="Notice · Measure · Build · Ship" start={6.2} size={60} perWord={0.14} />
      </div>
      <Fade start={7.6} style={{ fontSize: 34, color: "var(--accent)", fontWeight: 600, marginTop: 14 }}>
        That is the forward-deployed job.
      </Fade>
      <Fade start={9.0} style={{ fontSize: 26, color: "var(--text-2)", marginTop: 26 }}>
        Next: what I would do at Delta →
      </Fade>
    </div>
  </Scene>
);
