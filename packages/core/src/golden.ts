import type { Claim, Expected, GoldenCase } from "./types.js";

export function canonicalDigest(cases: Array<{ case_id: string; expected: Expected }>): string {
  const sorted = cases.map((c) => `${c.case_id}:${c.expected.decision}:${c.expected.amount.toFixed(2)}`).sort();
  return fnv1a64(sorted.join("\n"));
}

function fnv1a64(s: string): string {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x01000193 >>> 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 2246822519) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(2);
}

export interface FoundryRow {
  query: string;
  response: string;
  ground_truth: string;
  context: string;
}

/** Rows in the shape Microsoft Foundry's evaluation datasets use (query / response / ground_truth / context). */
export function toFoundryRows(cases: GoldenCase[], outputs?: Map<string, { decision: string; amount: number }>): FoundryRow[] {
  return cases.map((c) => {
    const out = outputs?.get(c.case_id);
    return {
      query: JSON.stringify(c.claim),
      response: out ? `${out.decision} ${out.amount.toFixed(2)}` : "",
      ground_truth: `${c.expected.decision} ${c.expected.amount.toFixed(2)}`,
      context: JSON.stringify({ source: c.source, cluster: c.cluster_name ?? null, graded_by: c.graded_by }),
    };
  });
}

export function casePasses(expected: Expected, output: { decision: string; amount: number; reason?: string }): boolean {
  if (expected.decision !== output.decision) return false;
  if (expected.decision !== "APPROVE") return true;
  const tol = Math.max(1, expected.amount * 0.01);
  return Math.abs(expected.amount - output.amount) <= tol;
}

export function claimId(claim: Claim): string {
  return claim.claim_id;
}
