import { pca2d, type Vec } from "./vector.js";

export interface LayoutGroup {
  key: string;
  indices: number[];
}

/**
 * Cluster-aware 2-D layout. Raw PCA of near-duplicate structured claims
 * collapses everything that shares a shape into a dot, so the map places
 * each group (the golden set with its covered traffic, each blind spot, the
 * long tail) by its position in a global PCA and spreads the members inside
 * a disc using a PCA computed within that group alone. Disc radius grows
 * with sqrt(n). Deterministic for a fixed seed.
 */
export function layoutMap(vectors: Vec[], groups: LayoutGroup[], seed = 7): Array<[number, number]> {
  const out: Array<[number, number]> = vectors.map(() => [0, 0]);
  const nonEmpty = groups.filter((g) => g.indices.length > 0);
  if (nonEmpty.length === 0) return out;
  const dim = (vectors[0] as Vec).length;
  const centroids = nonEmpty.map((g) => {
    const c = new Float32Array(dim);
    for (const i of g.indices) for (let d = 0; d < dim; d++) c[d] = (c[d] as number) + ((vectors[i] as Vec)[d] as number);
    for (let d = 0; d < dim; d++) c[d] = (c[d] as number) / g.indices.length;
    return c;
  });
  let centers: Array<[number, number]> = nonEmpty.length === 1 ? [[0.5, 0.5]] : pca2d(centroids, seed);
  if (nonEmpty.length > 1) {
    const xs = centers.map((c) => c[0]);
    const ys = centers.map((c) => c[1]);
    const sx = Math.max(...xs) - Math.min(...xs) || 1;
    const sy = Math.max(...ys) - Math.min(...ys) || 1;
    const s = Math.max(sx, sy);
    centers = centers.map(([x, y]) => [0.15 + ((x - Math.min(...xs)) / s) * 0.7, 0.15 + ((y - Math.min(...ys)) / s) * 0.7]);
  }
  const nMax = Math.max(...nonEmpty.map((g) => g.indices.length));
  const radii = nonEmpty.map((g) => 0.06 + 0.2 * Math.sqrt(g.indices.length / nMax));
  for (let iter = 0; iter < 120; iter++) {
    for (let a = 0; a < centers.length; a++) {
      for (let b = a + 1; b < centers.length; b++) {
        const ca = centers[a] as [number, number];
        const cb = centers[b] as [number, number];
        const dx = cb[0] - ca[0];
        const dy = cb[1] - ca[1];
        const dist = Math.hypot(dx, dy) || 1e-6;
        const minDist = (radii[a] as number) + (radii[b] as number) + 0.04;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          ca[0] -= ux * push;
          ca[1] -= uy * push;
          cb[0] += ux * push;
          cb[1] += uy * push;
        }
      }
    }
    for (const c of centers) {
      c[0] = Math.min(0.92, Math.max(0.08, c[0]));
      c[1] = Math.min(0.92, Math.max(0.08, c[1]));
    }
  }
  nonEmpty.forEach((g, gi) => {
    const local = g.indices.length >= 3 ? pca2d(g.indices.map((i) => vectors[i] as Vec), seed + gi) : g.indices.map((_, j) => [j * 0.3, 0] as [number, number]);
    const maxNorm = Math.max(1e-6, ...local.map(([x, y]) => Math.hypot(x, y)));
    const r = radii[gi] as number;
    const [cx, cy] = centers[gi] as [number, number];
    g.indices.forEach((i, j) => {
      const [lx, ly] = local[j] as [number, number];
      out[i] = [cx + (lx / maxNorm) * r, cy + (ly / maxNorm) * r];
    });
  });
  return out;
}
