import { mulberry32 } from "./prng.js";
import { quantile } from "./stats.js";
import { nearest, type Vec } from "./vector.js";
import type { CoverageHit } from "./types.js";

export interface CoverageSummary {
  threshold: number;
  covered: number;
  total: number;
  coverage: number;
  hits: CoverageHit[];
}

/**
 * "Covered" is defined relative to the golden set itself: hold out a slice of
 * golden cases, measure how close each is to the rest, and take the 5th
 * percentile. A production trace is covered when it is at least as close to
 * some golden case as 95% of the golden set is to itself.
 */
export function calibrateThreshold(
  goldenVecs: Vec[],
  opts: { holdoutFrac?: number; percentile?: number; seed?: number } = {},
): number {
  const frac = opts.holdoutFrac ?? 0.2;
  const p = opts.percentile ?? 0.05;
  const rng = mulberry32(opts.seed ?? 11);
  const idx = goldenVecs.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = idx[i] as number;
    idx[i] = idx[j] as number;
    idx[j] = t;
  }
  const nHold = Math.max(1, Math.floor(idx.length * frac));
  const hold = idx.slice(0, nHold);
  const rest = idx.slice(nHold).map((i) => goldenVecs[i] as Vec);
  const sims = hold.map((i) => nearest(goldenVecs[i] as Vec, rest).similarity);
  return quantile(sims, p);
}

export function computeCoverage(
  traces: Array<{ trace_id: string; vec: Vec }>,
  golden: Array<{ case_id: string; vec: Vec }>,
  threshold: number,
): CoverageSummary {
  const pool = golden.map((g) => g.vec);
  const hits: CoverageHit[] = traces.map((t) => {
    const n = nearest(t.vec, pool);
    const g = golden[n.index];
    return {
      trace_id: t.trace_id,
      nearest_case_id: g ? g.case_id : "",
      similarity: n.similarity,
      covered: n.similarity >= threshold,
    };
  });
  const covered = hits.filter((h) => h.covered).length;
  return { threshold, covered, total: hits.length, coverage: hits.length ? covered / hits.length : 1, hits };
}
