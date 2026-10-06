import { mulberry32 } from "./prng.js";
import { dot, type Vec } from "./vector.js";

export interface Candidate {
  id: string;
  vec: Vec;
  judge_confidence?: number;
  judge_disagrees?: boolean;
}

export interface Selection {
  ids: string[];
  roles: Record<string, "medoid" | "neighbor" | "random" | "disagreement">;
}

export function medoidIndex(vectors: Vec[]): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < vectors.length; i++) {
    let s = 0;
    for (let j = 0; j < vectors.length; j++) s += dot(vectors[i] as Vec, vectors[j] as Vec);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

/**
 * Pick the few cases worth an expert's time: the cluster's medoid, its closest
 * neighbours (the "typical" shape), a couple of random draws (so the typical
 * shape is not all we learn), then the traces where the judge was unsure or
 * disagreed with the agent.
 */
export function selectRepresentatives(
  candidates: Candidate[],
  opts: { budget?: number; neighbors?: number; random?: number; seed?: number } = {},
): Selection {
  const budget = opts.budget ?? 10;
  const nNeighbors = opts.neighbors ?? 2;
  const nRandom = opts.random ?? 2;
  const rng = mulberry32(opts.seed ?? 5);
  const roles: Selection["roles"] = {};
  const chosen = new Set<number>();
  if (candidates.length === 0 || !(budget >= 1)) return { ids: [], roles };

  const m = medoidIndex(candidates.map((c) => c.vec));
  chosen.add(m);
  roles[(candidates[m] as Candidate).id] = "medoid";

  const byProximity = candidates
    .map((c, i) => ({ i, s: dot(c.vec, (candidates[m] as Candidate).vec) }))
    .filter((x) => x.i !== m)
    .sort((a, b) => b.s - a.s);
  for (const { i } of byProximity.slice(0, nNeighbors)) {
    if (chosen.size >= budget) break;
    chosen.add(i);
    roles[(candidates[i] as Candidate).id] = "neighbor";
  }

  const remaining = candidates.map((_, i) => i).filter((i) => !chosen.has(i));
  for (let r = 0; r < nRandom && remaining.length && chosen.size < budget; r++) {
    const pickAt = Math.floor(rng() * remaining.length);
    const i = remaining.splice(pickAt, 1)[0] as number;
    chosen.add(i);
    roles[(candidates[i] as Candidate).id] = "random";
  }

  const uncertain = candidates
    .map((c, i) => ({ i, c }))
    .filter(({ i, c }) => !chosen.has(i) && (c.judge_disagrees || (c.judge_confidence ?? 1) < 0.6))
    .sort((a, b) => (a.c.judge_confidence ?? 1) - (b.c.judge_confidence ?? 1));
  for (const { i } of uncertain) {
    if (chosen.size >= budget) break;
    chosen.add(i);
    roles[(candidates[i] as Candidate).id] = "disagreement";
  }

  if (chosen.size < budget) {
    const rest = candidates.map((_, i) => i).filter((i) => !chosen.has(i));
    while (chosen.size < budget && rest.length) {
      const i = rest.splice(Math.floor(rng() * rest.length), 1)[0] as number;
      chosen.add(i);
      roles[(candidates[i] as Candidate).id] = "random";
    }
  }
  return { ids: Array.from(chosen).map((i) => (candidates[i] as Candidate).id), roles };
}
