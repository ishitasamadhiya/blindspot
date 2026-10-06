import { hashString } from "./prng.js";
import { normalize, type Vec } from "./vector.js";
import type { Claim } from "./types.js";

export interface Embedder {
  readonly name: string;
  readonly dim: number;
  embed(texts: string[]): Promise<Vec[]>;
}

const STRUCTURAL_SKIP = new Set(["claim_id", "retailer_id", "submitted_at"]);

function walk(value: unknown, path: string, out: string[]): void {
  if (Array.isArray(value)) {
    out.push(`path:${path}[]`);
    out.push(`len:${path}:${Math.min(value.length, 4)}`);
    for (const item of value.slice(0, 6)) walk(item, `${path}[]`, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k;
      if (STRUCTURAL_SKIP.has(k)) continue;
      out.push(`path:${p}`);
      walk(v, p, out);
    }
    return;
  }
  if (typeof value === "number") {
    const mag = value === 0 ? "zero" : `e${Math.floor(Math.log10(Math.abs(value)))}`;
    out.push(`num:${path}:${mag}`);
    return;
  }
  if (typeof value === "boolean") {
    out.push(`bool:${path}:${value}`);
    return;
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      out.push(`date:${path}`);
      return;
    }
    const lower = value.toLowerCase();
    if (/^[a-z]{2}-[a-z]+-\d{4}-\d{2}-\d{2}$/.test(lower)) {
      const parts = lower.split("-");
      out.push(`code:${path}:${parts[0]}-${parts[1]}`);
      return;
    }
    if (/^(inv|po|ref|tear|ck|dm|cm)[-_]?\d/.test(lower)) {
      out.push(`ref:${path}:${lower.slice(0, 3)}`);
      return;
    }
    out.push(`val:${path}:${lower.replace(/\s+/g, "_").slice(0, 32)}`);
    const words = lower.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    for (let i = 0; i < words.length; i++) {
      out.push(`w:${words[i]}`);
      if (i + 1 < words.length) out.push(`bg:${words[i]}_${words[i + 1]}`);
    }
  }
}

export function claimTokens(claim: Claim): string[] {
  const out: string[] = [];
  walk(claim, "", out);
  return out;
}

export function claimToText(claim: Claim): string {
  return JSON.stringify(claim, null, 1);
}

export class HashingEmbedder implements Embedder {
  readonly name = "hashing-v1";
  readonly dim: number;
  constructor(dim = 384) {
    this.dim = dim;
  }

  embedTokens(tokens: string[]): Vec {
    const v = new Float32Array(this.dim);
    for (const t of tokens) {
      const h = hashString(t);
      const idx = h % this.dim;
      const sign = (h >>> 31) === 1 ? -1 : 1;
      const weight = t.startsWith("path:") ? 2 : t.startsWith("w:") || t.startsWith("bg:") ? 0.6 : 1;
      v[idx] = (v[idx] as number) + sign * weight;
    }
    return normalize(v);
  }

  async embed(texts: string[]): Promise<Vec[]> {
    return texts.map((text) => {
      let claim: Claim;
      try {
        claim = JSON.parse(text) as Claim;
      } catch {
        return this.embedTokens(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w) => `w:${w}`));
      }
      return this.embedTokens(claimTokens(claim));
    });
  }
}

export async function embedClaims(embedder: Embedder, claims: Claim[]): Promise<Vec[]> {
  return embedder.embed(claims.map((c) => JSON.stringify(c)));
}
