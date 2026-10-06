import { describe, expect, it } from "vitest";
import { HashingEmbedder, calibrateThreshold, claimTokens, computeCoverage, generateSeed, type FlatClaim } from "../src/index.js";

const emb = new HashingEmbedder();

describe("hashing embedder", () => {
  it("is deterministic and unit length", async () => {
    const seed = generateSeed(1);
    const c = seed.golden[0]!.claim;
    const [a] = await emb.embed([JSON.stringify(c)]);
    const [b] = await emb.embed([JSON.stringify(c)]);
    expect(Array.from(a!)).toEqual(Array.from(b!));
    let n = 0;
    for (const v of a!) n += v * v;
    expect(n).toBeCloseTo(1, 4);
  });
  it("tokenises field paths, not ids", () => {
    const seed = generateSeed(1);
    const toks = claimTokens(seed.golden[0]!.claim);
    expect(toks).toContain("path:deduction_amt");
    expect(toks.some((t) => t.includes("claim_id"))).toBe(false);
  });
  it("puts a portal-v2 claim far from a flat claim and two flat claims close together", async () => {
    const seed = generateSeed(1);
    const flat = seed.golden.slice(0, 2).map((g) => JSON.stringify(g.claim));
    const v2 = seed.traces.find((t) => seed.formats[t.trace_id] === "portal-v2")!;
    const [a, b, c] = await emb.embed([...flat, JSON.stringify(v2.claim)]);
    const dot = (x: Float32Array, y: Float32Array) => x.reduce((s, v, i) => s + v * y[i]!, 0);
    expect(dot(a!, b!)).toBeGreaterThan(dot(a!, c!) + 0.2);
  });
});

describe("coverage", () => {
  it("covers the golden set against itself and flags a foreign shape", async () => {
    const seed = generateSeed(1);
    const golden = seed.golden;
    const vecs = await emb.embed(golden.map((g) => JSON.stringify(g.claim)));
    const threshold = calibrateThreshold(vecs, { seed: 1 });
    expect(threshold).toBeGreaterThan(0.3);
    expect(threshold).toBeLessThan(1);
    const self = computeCoverage(
      golden.map((g, i) => ({ trace_id: g.case_id, vec: vecs[i]! })),
      golden.map((g, i) => ({ case_id: g.case_id, vec: vecs[i]! })),
      threshold,
    );
    expect(self.coverage).toBe(1);
    const v2 = seed.traces.filter((t) => seed.formats[t.trace_id] === "portal-v2").slice(0, 20);
    const v2vecs = await emb.embed(v2.map((t) => JSON.stringify(t.claim)));
    const cov = computeCoverage(v2.map((t, i) => ({ trace_id: t.trace_id, vec: v2vecs[i]! })), golden.map((g, i) => ({ case_id: g.case_id, vec: vecs[i]! })), threshold);
    expect(cov.coverage).toBeLessThan(0.2);
  });
  it("threshold is calibrated on the golden set, not hard-coded", async () => {
    const seed = generateSeed(1);
    const vecs = await emb.embed(seed.golden.map((g) => JSON.stringify(g.claim)));
    const narrow = vecs.slice(0, 60);
    const t1 = calibrateThreshold(vecs, { seed: 1 });
    const t2 = calibrateThreshold(narrow, { seed: 1 });
    expect(t1).not.toBe(t2);
  });
  it("flat claims in production look like the golden set", async () => {
    const seed = generateSeed(1);
    const vecs = await emb.embed(seed.golden.map((g) => JSON.stringify(g.claim)));
    const threshold = calibrateThreshold(vecs, { seed: 1 });
    const flat = seed.traces.filter((t) => seed.formats[t.trace_id] === "flat-v1").slice(0, 100);
    const fv = await emb.embed(flat.map((t) => JSON.stringify(t.claim)));
    const cov = computeCoverage(flat.map((t, i) => ({ trace_id: t.trace_id, vec: fv[i]! })), seed.golden.map((g, i) => ({ case_id: g.case_id, vec: vecs[i]! })), threshold);
    expect(cov.coverage).toBeGreaterThan(0.9);
    const sample = flat[0]!.claim as FlatClaim;
    expect(sample.deduction_amt).toBeGreaterThan(0);
  });
});
