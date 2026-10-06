import { describe, expect, it } from "vitest";
import { bootstrapMeanCI, cohenKappa, mulberry32, pairedBootstrapCI, sha256 } from "../src/index.js";

describe("seeded prng", () => {
  it("is reproducible", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("bootstrap", () => {
  it("brackets the mean of a Bernoulli sample", () => {
    const x = Array.from({ length: 400 }, (_, i) => (i % 20 === 0 ? 0 : 1));
    const ci = bootstrapMeanCI(x, { nBoot: 2000, seed: 1 });
    expect(ci.estimate).toBeCloseTo(0.95, 5);
    expect(ci.lo).toBeLessThan(0.95);
    expect(ci.hi).toBeGreaterThan(0.95);
    expect(ci.hi - ci.lo).toBeLessThan(0.06);
  });
  it("paired delta of identical runs is exactly zero", () => {
    const a = [1, 0, 1, 1, 0, 1];
    const ci = pairedBootstrapCI(a, a, { nBoot: 500 });
    expect(ci.estimate).toBe(0);
    expect(ci.lo).toBe(0);
    expect(ci.hi).toBe(0);
  });
  it("paired delta interval includes zero when flips go both ways", () => {
    const a = Array.from({ length: 400 }, (_, i) => (i % 40 === 0 ? 0 : 1));
    const b = Array.from({ length: 400 }, (_, i) => (i % 40 === 20 ? 0 : 1));
    const ci = pairedBootstrapCI(a, b, { nBoot: 2000, seed: 2 });
    expect(ci.lo).toBeLessThanOrEqual(0);
    expect(ci.hi).toBeGreaterThanOrEqual(0);
  });
});

describe("cohen kappa", () => {
  it("is 1 for perfect agreement and ~0 for independent labels", () => {
    expect(cohenKappa([1, 0, 1, 0], [1, 0, 1, 0])).toBe(1);
    const a = Array.from({ length: 1000 }, (_, i) => i % 2);
    const b = Array.from({ length: 1000 }, (_, i) => Math.floor(i / 2) % 2);
    expect(Math.abs(cohenKappa(a, b))).toBeLessThan(0.05);
  });
});

describe("sha256", () => {
  it("matches the standard test vectors", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256("a".repeat(1000))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
  });
});
