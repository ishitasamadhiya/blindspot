import { mulberry32 } from "./prng.js";
import { centroid, dot, normalize, type Vec } from "./vector.js";

export interface ClusterResult {
  k: number;
  assignments: number[];
  centroids: Vec[];
  silhouette: number;
}

function kmeans(vectors: Vec[], k: number, seed: number, iters = 25): { assignments: number[]; centroids: Vec[] } {
  const rng = mulberry32(seed);
  const n = vectors.length;
  const dim = (vectors[0] as Vec).length;
  const centers: Vec[] = [vectors[Math.floor(rng() * n)] as Vec];
  while (centers.length < k) {
    const d2 = vectors.map((v) => {
      let best = -Infinity;
      for (const c of centers) best = Math.max(best, dot(v, c));
      return Math.max(0, 1 - best) ** 2;
    });
    const total = d2.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      r -= d2[i] as number;
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    centers.push(vectors[chosen] as Vec);
  }
  let assignments = new Array<number>(n).fill(0);
  for (let it = 0; it < iters; it++) {
    const next = vectors.map((v) => {
      let best = 0;
      let bestSim = -Infinity;
      for (let c = 0; c < centers.length; c++) {
        const s = dot(v, centers[c] as Vec);
        if (s > bestSim) {
          bestSim = s;
          best = c;
        }
      }
      return best;
    });
    let changed = false;
    for (let i = 0; i < n; i++) if (next[i] !== assignments[i]) changed = true;
    assignments = next;
    for (let c = 0; c < centers.length; c++) {
      const members = vectors.filter((_, i) => assignments[i] === c);
      if (members.length) centers[c] = normalize(centroid(members, dim));
    }
    if (!changed) break;
  }
  return { assignments, centroids: centers };
}

function silhouette(vectors: Vec[], assignments: number[], k: number, sampleSeed: number): number {
  const n = vectors.length;
  if (k < 2 || n < 3) return 0;
  const rng = mulberry32(sampleSeed);
  const sampleSize = Math.min(n, 300);
  const idx = Array.from({ length: sampleSize }, () => Math.floor(rng() * n));
  let total = 0;
  for (const i of idx) {
    const own = assignments[i] as number;
    const byCluster = new Array<number>(k).fill(0);
    const counts = new Array<number>(k).fill(0);
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const d = 1 - dot(vectors[i] as Vec, vectors[j] as Vec);
      const c = assignments[j] as number;
      byCluster[c] = (byCluster[c] as number) + d;
      counts[c] = (counts[c] as number) + 1;
    }
    const a = (counts[own] as number) > 0 ? (byCluster[own] as number) / (counts[own] as number) : 0;
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === own || (counts[c] as number) === 0) continue;
      b = Math.min(b, (byCluster[c] as number) / (counts[c] as number));
    }
    if (!Number.isFinite(b)) continue;
    total += (b - a) / Math.max(a, b, 1e-9);
  }
  return total / sampleSize;
}

export function clusterVectors(vectors: Vec[], opts: { minK?: number; maxK?: number; seed?: number } = {}): ClusterResult {
  const seed = opts.seed ?? 3;
  if (vectors.length < 4) {
    return { k: 1, assignments: vectors.map(() => 0), centroids: vectors.length ? [normalize(centroid(vectors, (vectors[0] as Vec).length))] : [], silhouette: 0 };
  }
  const minK = opts.minK ?? 2;
  const maxK = Math.min(opts.maxK ?? 8, Math.floor(vectors.length / 4));
  let best: ClusterResult | null = null;
  for (let k = minK; k <= Math.max(minK, maxK); k++) {
    const run = kmeans(vectors, k, seed + k);
    const s = silhouette(vectors, run.assignments, k, seed);
    if (!best || s > best.silhouette + 1e-6) best = { k, ...run, silhouette: s };
  }
  return best as ClusterResult;
}

export function distinguishingTokens(
  memberTokens: string[][],
  backgroundTokens: string[][],
  limit = 3,
): string[] {
  const inCluster = new Map<string, number>();
  const inBackground = new Map<string, number>();
  for (const toks of memberTokens) for (const t of new Set(toks)) inCluster.set(t, (inCluster.get(t) ?? 0) + 1);
  for (const toks of backgroundTokens) for (const t of new Set(toks)) inBackground.set(t, (inBackground.get(t) ?? 0) + 1);
  const scored: Array<{ token: string; pretty: string; field: string; score: number; nested: boolean; kind: number }> = [];
  for (const [t, c] of inCluster) {
    const kind = t.startsWith("path:") ? 0 : t.startsWith("val:") ? 1 : t.startsWith("code:") ? 2 : -1;
    if (kind < 0) continue;
    const pc = c / memberTokens.length;
    const pb = (inBackground.get(t) ?? 0) / Math.max(1, backgroundTokens.length);
    const score = pc - pb;
    if (score <= 0) continue;
    const body = t.slice(t.indexOf(":") + 1);
    const field = body.split(":")[0]?.split(/[.[]/)[0] ?? body;
    let pretty: string;
    if (kind === 0) pretty = body;
    else {
      const [path, ...rest] = body.split(":");
      pretty = `${path}=${rest.join(":").replace(/_/g, " ").slice(0, 28)}`;
    }
    scored.push({ token: t, pretty, field, score, nested: /[.[]/.test(body.split(":")[0] ?? ""), kind });
  }
  scored.sort((a, b) => b.score - a.score || a.kind - b.kind || Number(b.nested) - Number(a.nested) || a.pretty.localeCompare(b.pretty));
  const names: string[] = [];
  const usedFields = new Set<string>();
  for (const s of scored) {
    if (usedFields.has(s.field)) continue;
    usedFields.add(s.field);
    names.push(s.nested && s.kind === 0 ? s.field : s.pretty);
    if (names.length >= limit) break;
  }
  return names;
}
