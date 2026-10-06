import React from "react";
import { Audio, Composition, Sequence, staticFile } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import "@web/styles.css";
import "./video.css";
import timing from "./data/timing.json";
import snapshotJson from "./data/snapshot.json";
import type { Snapshot } from "./data/types";
import { Hook, Hypothesis, Measure, Signal, Works } from "./scenes/Part1";
import { Move1, Move2, Move3, Stack } from "./scenes/Part2";
import { Before, Blocked, Close, Control, Fixed, Harvest, Proof, WhyMe } from "./scenes/Part3";

loadInter("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] });
loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

const FPS = 30;
const snap = snapshotJson as unknown as Snapshot;
const GAP = 0.35;

type SceneKey = keyof typeof timing;
const SCENES: Array<{ key: SceneKey; min: number; render: (seconds: number) => React.ReactNode }> = [
  { key: "hook", min: 9, render: (s) => <Hook seconds={s} snap={snap} /> },
  { key: "works", min: 6, render: (s) => <Works seconds={s} /> },
  { key: "signal", min: 5.5, render: (s) => <Signal seconds={s} snap={snap} /> },
  { key: "hypothesis", min: 4.5, render: (s) => <Hypothesis seconds={s} /> },
  { key: "measure", min: 6.5, render: (s) => <Measure seconds={s} snap={snap} /> },
  { key: "move1", min: 10, render: (s) => <Move1 seconds={s} snap={snap} /> },
  { key: "move2", min: 10, render: (s) => <Move2 seconds={s} snap={snap} /> },
  { key: "move3", min: 10, render: (s) => <Move3 seconds={s} snap={snap} /> },
  { key: "stack", min: 7.5, render: (s) => <Stack seconds={s} /> },
  { key: "before", min: 3.4, render: (s) => <Before seconds={s} snap={snap} /> },
  { key: "harvest", min: 4.2, render: (s) => <Harvest seconds={s} snap={snap} /> },
  { key: "blocked", min: 6.5, render: (s) => <Blocked seconds={s} snap={snap} /> },
  { key: "fixed", min: 8, render: (s) => <Fixed seconds={s} snap={snap} /> },
  { key: "control", min: 6, render: (s) => <Control seconds={s} snap={snap} /> },
  { key: "whyme", min: 7, render: (s) => <WhyMe seconds={s} /> },
  { key: "proof", min: 12, render: (s) => <Proof seconds={s} /> },
  { key: "close", min: 8, render: (s) => <Close seconds={s} /> },
];

export const plan = SCENES.map((s) => {
  const clip = (timing as Record<string, { seconds: number; file: string }>)[s.key];
  const seconds = Math.max(s.min, (clip?.seconds ?? 0) + GAP);
  return { ...s, seconds, frames: Math.round(seconds * FPS), file: clip?.file ?? null };
});
const TOTAL = plan.reduce((n, s) => n + s.frames, 0);

const Demo: React.FC<{ withAudio: boolean }> = ({ withAudio }) => {
  let from = 0;
  return (
    <>
      {plan.map((s) => {
        const start = from;
        from += s.frames;
        return (
          <Sequence key={s.key} from={start} durationInFrames={s.frames} name={s.key}>
            {s.render(s.seconds)}
            {withAudio && s.file ? <Audio src={staticFile(s.file)} /> : null}
          </Sequence>
        );
      })}
    </>
  );
};

export const Root: React.FC = () => (
  <>
    <Composition id="Demo" component={Demo} defaultProps={{ withAudio: true }} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="DemoSilent" component={Demo} defaultProps={{ withAudio: false }} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
    {plan.map((s) => (
      <Composition key={s.key} id={`scene-${s.key}`} component={() => <>{s.render(s.seconds)}</>} durationInFrames={s.frames} fps={FPS} width={1920} height={1080} />
    ))}
  </>
);
