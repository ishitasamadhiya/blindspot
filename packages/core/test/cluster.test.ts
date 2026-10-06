import { describe, expect, it } from "vitest";
import { clusterVectors, distinguishingTokens, normalize, selectRepresentatives } from "../src/index.js";

function blob(center: number[], n: number, seed: number): Float32Array[] {
  let s = seed;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
  return Array.from({ length: n }, () => normalize(Float32Array.from(center.map((c) => c + rand() * 0.2))));
}

describe("clustering", () => {
  it("finds three well separated blobs and is deterministic", () => {
    const vecs = [...blob([1, 0, 0, 0], 30, 1), ...blob([0, 1, 0, 0], 30, 2), ...blob([0, 0, 1, 0], 30, 3)];
    const a = clusterVectors(vecs, { seed: 9 });
    const b = clusterVectors(vecs, { seed: 9 });
    expect(a.k).toBe(3);
    expect(a.assignments).toEqual(b.assignments);
    const groups = new Set([a.assignments.slice(0, 30).join(), a.assignments.slice(30, 60).join(), a.assignments.slice(60).join()]);
    expect(groups.size).toBe(3);
    for (const g of groups) expect(new Set(g.split(",")).size).toBe(1);
  });
  it("names a cluster by the field paths that set it apart", () => {
    const members = Array.from({ length: 10 }, () => ["path:line_items", "path:line_items[].deduction", "path:export_version", "path:promo_code", "val:currency:usd"]);
    const background = Array.from({ length: 50 }, () => ["path:deduction_amt", "path:promo_code", "val:currency:usd"]);
    const names = distinguishingTokens(members, background, 3);
    expect(names).toEqual(["line_items", "export_version"]);
  });
});

describe("selection", () => {
  it("picks the medoid, neighbours, random draws and judge disagreements within budget", () => {
    const vecs = blob([1, 0, 0, 0], 40, 5);
    const candidates = vecs.map((vec, i) => ({ id: `t${i}`, vec, judge_confidence: i < 8 ? 0.4 : 0.9, judge_disagrees: i % 10 === 0 }));
    const sel = selectRepresentatives(candidates, { budget: 10, seed: 1 });
    expect(sel.ids.length).toBe(10);
    expect(new Set(sel.ids).size).toBe(10);
    const roles = Object.values(sel.roles);
    expect(roles.filter((r) => r === "medoid").length).toBe(1);
    expect(roles.filter((r) => r === "neighbor").length).toBe(2);
    expect(roles.filter((r) => r === "disagreement").length).toBeGreaterThan(0);
  });
});
