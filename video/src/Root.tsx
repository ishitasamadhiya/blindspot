import React from "react";
import { Audio, Composition, Sequence, staticFile, useCurrentFrame } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/InstrumentSans";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import "@web/styles.css";
import "./video.css";
import timing from "./data/timing.json";
import snapshotJson from "./data/snapshot.json";
import type { Snapshot } from "./data/types";
import { ChapterBar } from "./components/Motion";
import { AvatarOverlay, type AvatarCue, type AvatarMode } from "./scenes/AvatarOverlay";
import { Csail, FrontDesk, Hi, Holo, How, Valency } from "./scenes/About";
import { Coverage, Moves, Notice, Result } from "./scenes/Pitch";
import { Hook, Hypothesis, Measure, Signal, Works } from "./scenes/Part1";
import { Move1, Move2, Move3, Stack } from "./scenes/Part2";
import { Before, Blocked, Close, Control, Fixed, Harvest, Proof } from "./scenes/Part3";

loadSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

const FPS = 30;
const GAP = 0.35;
const snap = snapshotJson as unknown as Snapshot;
type Clip = { seconds: number; file: string; envelope?: number[] };
const clips = timing as Record<string, Clip>;

type SceneDef = { key: string; min: number; chapter: string; avatar: AvatarMode; voDelay?: number; render: (seconds: number) => React.ReactNode };

/** The short cut: a minute of who I am and how I work, then thirty seconds of what I would do at Delta. */
const SHORT_CHAPTERS = ["Who I am", "What I have built", "What I would do at Delta"] as const;
const SHORT: SceneDef[] = [
  { key: "hi", min: 9, chapter: "Who I am", avatar: "big", voDelay: 1.1, render: (s) => <Hi seconds={s} /> },
  { key: "how", min: 9, chapter: "Who I am", avatar: "big", render: (s) => <How seconds={s} /> },
  { key: "frontdesk", min: 9, chapter: "What I have built", avatar: "big", render: (s) => <FrontDesk seconds={s} /> },
  { key: "valency", min: 9, chapter: "What I have built", avatar: "big", render: (s) => <Valency seconds={s} /> },
  { key: "csail", min: 7, chapter: "What I have built", avatar: "big", render: (s) => <Csail seconds={s} /> },
  { key: "holo", min: 8, chapter: "What I have built", avatar: "big", render: (s) => <Holo seconds={s} /> },
  { key: "notice", min: 8, chapter: "What I would do at Delta", avatar: "small", render: (s) => <Notice seconds={s} snap={snap} /> },
  { key: "coverage", min: 7, chapter: "What I would do at Delta", avatar: "small", render: (s) => <Coverage seconds={s} snap={snap} /> },
  { key: "moves", min: 8, chapter: "What I would do at Delta", avatar: "small", render: (s) => <Moves seconds={s} /> },
  { key: "result", min: 9.5, chapter: "What I would do at Delta", avatar: "small", render: (s) => <Result seconds={s} snap={snap} /> },
];

/** The long walkthrough of the prototype, kept as its own composition. */
const FULL_CHAPTERS = ["Who I am", "Noticed", "Investigated", "Built", "Shipped"] as const;
const FULL: SceneDef[] = [
  SHORT[0]!,
  { key: "proof", min: 11, chapter: "Who I am", avatar: "none", render: (s) => <Proof seconds={s} /> },
  { key: "hook", min: 10, chapter: "Noticed", avatar: "none", render: (s) => <Hook seconds={s} snap={snap} /> },
  { key: "works", min: 6, chapter: "Noticed", avatar: "none", render: (s) => <Works seconds={s} /> },
  { key: "signal", min: 5.5, chapter: "Investigated", avatar: "none", render: (s) => <Signal seconds={s} snap={snap} /> },
  { key: "hypothesis", min: 5, chapter: "Investigated", avatar: "none", render: (s) => <Hypothesis seconds={s} /> },
  { key: "measure", min: 6.5, chapter: "Investigated", avatar: "none", render: (s) => <Measure seconds={s} snap={snap} /> },
  { key: "move1", min: 10, chapter: "Built", avatar: "none", render: (s) => <Move1 seconds={s} snap={snap} /> },
  { key: "move2", min: 10.5, chapter: "Built", avatar: "none", render: (s) => <Move2 seconds={s} snap={snap} /> },
  { key: "move3", min: 10, chapter: "Built", avatar: "none", render: (s) => <Move3 seconds={s} snap={snap} /> },
  { key: "stack", min: 7.5, chapter: "Built", avatar: "none", render: (s) => <Stack seconds={s} /> },
  { key: "before", min: 3.4, chapter: "Shipped", avatar: "none", render: (s) => <Before seconds={s} snap={snap} /> },
  { key: "harvest", min: 4.2, chapter: "Shipped", avatar: "none", render: (s) => <Harvest seconds={s} snap={snap} /> },
  { key: "blocked", min: 6.5, chapter: "Shipped", avatar: "none", render: (s) => <Blocked seconds={s} snap={snap} /> },
  { key: "fixed", min: 8, chapter: "Shipped", avatar: "none", render: (s) => <Fixed seconds={s} snap={snap} /> },
  { key: "control", min: 6, chapter: "Shipped", avatar: "none", render: (s) => <Control seconds={s} snap={snap} /> },
  { key: "close", min: 8, chapter: "Shipped", avatar: "none", render: (s) => <Close seconds={s} /> },
];

type Planned = SceneDef & { seconds: number; frames: number; from: number; file: string | null; voDelayFrames: number };
function buildPlan(defs: SceneDef[]): Planned[] {
  let from = 0;
  return defs.map((s) => {
    const clip = clips[s.key];
    const voDelay = s.voDelay ?? 0;
    const seconds = Math.max(s.min, voDelay + (clip?.seconds ?? 0) + GAP);
    const frames = Math.round(seconds * FPS);
    const planned = { ...s, seconds, frames, from, file: clip?.file ?? null, voDelayFrames: Math.round(voDelay * FPS) };
    from += frames;
    return planned;
  });
}
export const plan = buildPlan(SHORT);
const fullPlan = buildPlan(FULL);
const total = (p: Planned[]) => p.reduce((n, s) => n + s.frames, 0);
const chapterSpan = (p: Planned[], chapter: string) => {
  const inChapter = p.filter((s) => s.chapter === chapter);
  const first = inChapter[0]!;
  const last = inChapter[inChapter.length - 1]!;
  return { start: first.from, end: last.from + last.frames };
};
const cuesFor = (p: Planned[]): AvatarCue[] => p.map((s) => ({ from: s.from, frames: s.frames, mode: s.avatar, envelope: clips[s.key]?.envelope ?? [], voDelay: s.voDelayFrames }));

/** Drawn above the avatar so the strip stays readable under the big portrait. */
const Chapters: React.FC<{ scenes: Planned[]; chapters: readonly string[] }> = ({ scenes, chapters }) => {
  const frame = useCurrentFrame();
  const scene = scenes.find((s) => frame >= s.from && frame < s.from + s.frames) ?? scenes[scenes.length - 1]!;
  const span = chapterSpan(scenes, scene.chapter);
  const progress = Math.max(0, Math.min(1, (frame - span.start) / Math.max(1, span.end - span.start)));
  return <ChapterBar chapters={chapters} chapter={scene.chapter} progress={progress} />;
};

const Film: React.FC<{ scenes: Planned[]; chapters: readonly string[]; withAudio: boolean }> = ({ scenes, chapters, withAudio }) => (
  <>
    {withAudio ? <Audio src={staticFile("audio/sfx/bed.wav")} volume={0.16} /> : null}
    {scenes.map((s) => (
      <Sequence key={s.key} from={s.from} durationInFrames={s.frames} name={s.key}>
        {s.render(s.seconds)}
        {withAudio && s.file ? (
          <Sequence from={s.voDelayFrames} name={`${s.key} narration`}>
            <Audio src={staticFile(s.file)} />
          </Sequence>
        ) : null}
      </Sequence>
    ))}
    <AvatarOverlay cues={cuesFor(scenes)} />
    <Chapters scenes={scenes} chapters={chapters} />
  </>
);

const Demo: React.FC<{ withAudio: boolean }> = ({ withAudio }) => <Film scenes={plan} chapters={SHORT_CHAPTERS} withAudio={withAudio} />;
const DemoFull: React.FC<{ withAudio: boolean }> = ({ withAudio }) => <Film scenes={fullPlan} chapters={FULL_CHAPTERS} withAudio={withAudio} />;

const stills = [...plan, ...fullPlan.filter((s) => !plan.some((p) => p.key === s.key))];

export const Root: React.FC = () => (
  <>
    <Composition id="Demo" component={Demo} defaultProps={{ withAudio: true }} durationInFrames={total(plan)} fps={FPS} width={1920} height={1080} />
    <Composition id="DemoSilent" component={Demo} defaultProps={{ withAudio: false }} durationInFrames={total(plan)} fps={FPS} width={1920} height={1080} />
    <Composition id="DemoFull" component={DemoFull} defaultProps={{ withAudio: true }} durationInFrames={total(fullPlan)} fps={FPS} width={1920} height={1080} />
    {stills.map((s) => (
      <Composition key={s.key} id={`scene-${s.key}`} component={() => <>{s.render(s.seconds)}</>} durationInFrames={s.frames} fps={FPS} width={1920} height={1080} />
    ))}
  </>
);
