import React from "react";
import { Audio, Composition, Sequence, staticFile } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/InstrumentSans";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import "@web/styles.css";
import "./video.css";
import timing from "./data/timing.json";
import snapshotJson from "./data/snapshot.json";
import type { Snapshot } from "./data/types";
import { ChapterBar, type Chapter } from "./components/Motion";
import { Hook, Hypothesis, Measure, Signal, Works } from "./scenes/Part1";
import { Move1, Move2, Move3, Stack } from "./scenes/Part2";
import { Before, Blocked, Close, Control, Fixed, Harvest, Proof } from "./scenes/Part3";
import { Avatar } from "./scenes/Avatar";

loadSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

const FPS = 30;
const snap = snapshotJson as unknown as Snapshot;
const GAP = 0.35;

type SceneKey = keyof typeof timing;
const SCENES: Array<{ key: SceneKey; min: number; chapter: Chapter; render: (seconds: number) => React.ReactNode }> = [
  { key: "avatar", min: 9, chapter: "Who I am", render: (s) => <Avatar seconds={s} /> },
  { key: "proof", min: 11, chapter: "Who I am", render: (s) => <Proof seconds={s} /> },
  { key: "hook", min: 10, chapter: "Noticed", render: (s) => <Hook seconds={s} snap={snap} /> },
  { key: "works", min: 6, chapter: "Noticed", render: (s) => <Works seconds={s} /> },
  { key: "signal", min: 5.5, chapter: "Investigated", render: (s) => <Signal seconds={s} snap={snap} /> },
  { key: "hypothesis", min: 5, chapter: "Investigated", render: (s) => <Hypothesis seconds={s} /> },
  { key: "measure", min: 6.5, chapter: "Investigated", render: (s) => <Measure seconds={s} snap={snap} /> },
  { key: "move1", min: 10, chapter: "Built", render: (s) => <Move1 seconds={s} snap={snap} /> },
  { key: "move2", min: 10.5, chapter: "Built", render: (s) => <Move2 seconds={s} snap={snap} /> },
  { key: "move3", min: 10, chapter: "Built", render: (s) => <Move3 seconds={s} snap={snap} /> },
  { key: "stack", min: 7.5, chapter: "Built", render: (s) => <Stack seconds={s} /> },
  { key: "before", min: 3.4, chapter: "Shipped", render: (s) => <Before seconds={s} snap={snap} /> },
  { key: "harvest", min: 4.2, chapter: "Shipped", render: (s) => <Harvest seconds={s} snap={snap} /> },
  { key: "blocked", min: 6.5, chapter: "Shipped", render: (s) => <Blocked seconds={s} snap={snap} /> },
  { key: "fixed", min: 8, chapter: "Shipped", render: (s) => <Fixed seconds={s} snap={snap} /> },
  { key: "control", min: 6, chapter: "Shipped", render: (s) => <Control seconds={s} snap={snap} /> },
  { key: "close", min: 8, chapter: "Shipped", render: (s) => <Close seconds={s} /> },
];

export const plan = SCENES.map((s) => {
  const clip = (timing as Record<string, { seconds: number; file: string }>)[s.key];
  const seconds = Math.max(s.min, (clip?.seconds ?? 0) + GAP);
  return { ...s, seconds, frames: Math.round(seconds * FPS), file: clip?.file ?? null };
});
const TOTAL = plan.reduce((n, s) => n + s.frames, 0);
const chapterSpan = (chapter: Chapter) => {
  let from = 0;
  let start = -1;
  let end = 0;
  for (const s of plan) {
    if (s.chapter === chapter) {
      if (start < 0) start = from;
      end = from + s.frames;
    }
    from += s.frames;
  }
  return { start, end };
};

const Demo: React.FC<{ withAudio: boolean }> = ({ withAudio }) => {
  let from = 0;
  return (
    <>
      {withAudio ? <Audio src={staticFile("audio/sfx/bed.wav")} volume={0.16} /> : null}
      {plan.map((s) => {
        const start = from;
        from += s.frames;
        const span = chapterSpan(s.chapter);
        return (
          <Sequence key={s.key} from={start} durationInFrames={s.frames} name={s.key}>
            {s.render(s.seconds)}
            <ChapterProgress chapter={s.chapter} sceneStart={start} span={span} />
            {withAudio && s.file ? <Audio src={staticFile(s.file)} /> : null}
          </Sequence>
        );
      })}
    </>
  );
};

import { useCurrentFrame } from "remotion";
const ChapterProgress: React.FC<{ chapter: Chapter; sceneStart: number; span: { start: number; end: number } }> = ({ chapter, sceneStart, span }) => {
  const frame = useCurrentFrame();
  const abs = sceneStart + frame;
  const progress = Math.max(0, Math.min(1, (abs - span.start) / Math.max(1, span.end - span.start)));
  return <ChapterBar chapter={chapter} progress={progress} />;
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
