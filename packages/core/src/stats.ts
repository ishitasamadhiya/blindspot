import { mulberry32 } from "./prng.js";
import type { Interval } from "./types.js";

function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const w = idx - lo;
  return (sorted[lo] as number) * (1 - w) + (sorted[hi] as number) * w;
}

export function mean(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] as number;
  return x.length ? s / x.length : NaN;
}

export function bootstrapMeanCI(
  x: ArrayLike<number>,
  opts: { nBoot?: number; alpha?: number; seed?: number } = {},
): Interval {
  const nBoot = opts.nBoot ?? 10_000;
  const alpha = opts.alpha ?? 0.05;
  const n = x.length;
  if (n < 2) return { estimate: mean(x), lo: NaN, hi: NaN, n, n_boot: 0 };
  const rng = mulberry32(opts.seed ?? 0);
  const samples = new Float64Array(nBoot);
  for (let b = 0; b < nBoot; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[Math.floor(rng() * n)] as number;
    samples[b] = s / n;
  }
  samples.sort();
  return {
    estimate: mean(x),
    lo: percentile(samples, alpha / 2),
    hi: percentile(samples, 1 - alpha / 2),
    n,
    n_boot: nBoot,
  };
}

export function pairedBootstrapCI(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  opts: { nBoot?: number; alpha?: number; seed?: number } = {},
): Interval {
  if (a.length !== b.length) throw new Error("paired bootstrap needs aligned samples");
  const n = a.length;
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) d[i] = (a[i] as number) - (b[i] as number);
  return bootstrapMeanCI(d, opts);
}

export function cohenKappa(a: ArrayLike<string | number | boolean>, b: ArrayLike<string | number | boolean>): number {
  if (a.length !== b.length || a.length === 0) return NaN;
  const n = a.length;
  const cats = new Map<string, number>();
  const key = (v: string | number | boolean) => String(v);
  for (let i = 0; i < n; i++) {
    for (const v of [a[i], b[i]]) {
      const k = key(v as string);
      if (!cats.has(k)) cats.set(k, cats.size);
    }
  }
  const k = cats.size;
  const m = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < n; i++) {
    const r = cats.get(key(a[i] as string)) as number;
    const c = cats.get(key(b[i] as string)) as number;
    (m[r] as number[])[c] = ((m[r] as number[])[c] as number) + 1;
  }
  let po = 0;
  let pe = 0;
  for (let i = 0; i < k; i++) {
    po += (m[i] as number[])[i] as number;
    const rowSum = (m[i] as number[]).reduce((s, v) => s + v, 0);
    const colSum = m.reduce((s, row) => s + (row[i] as number), 0);
    pe += (rowSum / n) * (colSum / n);
  }
  po /= n;
  if (pe === 1) return 1;
  return (po - pe) / (1 - pe);
}

export function agreementRate(a: ArrayLike<boolean>, b: ArrayLike<boolean>): number {
  if (a.length !== b.length || a.length === 0) return NaN;
  let agree = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) agree++;
  return agree / a.length;
}

export function quantile(values: number[], p: number): number {
  const s = Float64Array.from(values).sort();
  return percentile(s, p);
}
