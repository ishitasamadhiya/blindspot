export type Vec = Float32Array;

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] as number) * (b[i] as number);
  return s;
}

export function normalize(v: Vec): Vec {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += (v[i] as number) * (v[i] as number);
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = (v[i] as number) / n;
  return out;
}

export function cosine(a: Vec, b: Vec): number {
  return dot(a, b);
}

export function nearest(query: Vec, pool: Vec[]): { index: number; similarity: number } {
  let best = -1;
  let bestSim = -Infinity;
  for (let i = 0; i < pool.length; i++) {
    const s = dot(query, pool[i] as Vec);
    if (s > bestSim) {
      bestSim = s;
      best = i;
    }
  }
  return { index: best, similarity: bestSim };
}

export function centroid(vectors: Vec[], dim: number): Vec {
  const c = new Float32Array(dim);
  for (const v of vectors) for (let i = 0; i < dim; i++) c[i] = (c[i] as number) + (v[i] as number);
  for (let i = 0; i < dim; i++) c[i] = (c[i] as number) / (vectors.length || 1);
  return c;
}

export function pca2d(vectors: Vec[], seed = 7): Array<[number, number]> {
  if (vectors.length === 0) return [];
  const dim = (vectors[0] as Vec).length;
  const mu = centroid(vectors, dim);
  const centered = vectors.map((v) => {
    const out = new Float32Array(dim);
    for (let i = 0; i < dim; i++) out[i] = (v[i] as number) - (mu[i] as number);
    return out;
  });
  const components: Float64Array[] = [];
  let state = seed >>> 0;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296 - 0.5;
  };
  for (let c = 0; c < 2; c++) {
    let w = new Float64Array(dim);
    for (let i = 0; i < dim; i++) w[i] = rand();
    for (let iter = 0; iter < 60; iter++) {
      const next = new Float64Array(dim);
      for (const v of centered) {
        let proj = 0;
        for (let i = 0; i < dim; i++) proj += (v[i] as number) * (w[i] as number);
        for (let i = 0; i < dim; i++) next[i] = (next[i] as number) + proj * (v[i] as number);
      }
      for (const prev of components) {
        let p = 0;
        for (let i = 0; i < dim; i++) p += (next[i] as number) * (prev[i] as number);
        for (let i = 0; i < dim; i++) next[i] = (next[i] as number) - p * (prev[i] as number);
      }
      let norm = 0;
      for (let i = 0; i < dim; i++) norm += (next[i] as number) ** 2;
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < dim; i++) next[i] = (next[i] as number) / norm;
      w = next;
    }
    components.push(w);
  }
  const [c0, c1] = components as [Float64Array, Float64Array];
  return centered.map((v) => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < dim; i++) {
      x += (v[i] as number) * (c0[i] as number);
      y += (v[i] as number) * (c1[i] as number);
    }
    return [x, y];
  });
}
