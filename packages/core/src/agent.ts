import { CONTRACTS_BY_CODE, FX_TO_USD, PROMO_TYPES } from "./contracts.js";
import type { AgentOutput, Claim, CoopClaim, FlatClaim, PortalV2Claim, ScanBackClaim } from "./types.js";

export interface AgentVersion {
  version: string;
  release_tag: string;
  summary: string;
  patch: string;
  run: (claim: Claim, ctx: AgentContext) => AgentOutput;
}

export interface AgentContext {
  seenInvoices: Set<string>;
}

export function newContext(): AgentContext {
  return { seenInvoices: new Set() };
}

const OVERCLAIM_TOLERANCE = 0.02;
const PARTIAL_LIMIT = 0.25;
const PERIOD_GRACE_DAYS = 0;

function within(period: { start: string; end: string }, start: string, end: string, graceDays: number): boolean {
  const s = Date.parse(start);
  const e = Date.parse(end);
  const ps = Date.parse(period.start) - graceDays * 86_400_000;
  const pe = Date.parse(period.end) + graceDays * 86_400_000;
  return s >= ps && e <= pe;
}

function decideAgainstAllowed(claimed: number, allowed: number, tolerance: number): AgentOutput {
  if (claimed <= allowed * (1 + tolerance)) {
    return { decision: "APPROVE", amount: round2(claimed), reason: `claimed ${fmt(claimed)} within allowed ${fmt(allowed)}` };
  }
  if (claimed <= allowed * (1 + PARTIAL_LIMIT)) {
    return { decision: "APPROVE", amount: round2(allowed), reason: `over-claim ${fmt(claimed)}; approved at contract allowance ${fmt(allowed)}` };
  }
  return { decision: "REJECT", amount: 0, reason: `claimed ${fmt(claimed)} exceeds allowed ${fmt(allowed)} by more than ${PARTIAL_LIMIT * 100}%` };
}

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Parsed {
  invoice?: string;
  promoCode?: string;
  promoType?: string;
  cases: number;
  claimed: number;
  currency: string;
  period?: { start: string; end: string };
  proof?: string;
}

/** Release 1.3: the parser that shipped with the September deployment. Reads the flat Contoso claim shape only. */
function parseV13(claim: Claim): Parsed {
  const c = claim as Partial<FlatClaim> & Partial<ScanBackClaim> & Partial<CoopClaim> & Partial<PortalV2Claim>;
  return {
    invoice: c.invoice_no,
    promoCode: c.promo_code,
    promoType: c.promo_type,
    cases: c.cases ?? 0,
    claimed: c.deduction_amt ?? 0,
    currency: c.currency ?? "USD",
    period: c.period,
  };
}

/** Release 1.4: walks portal-v2 line items, knows scan-back and co-op, reads the period from wherever the claim puts it. */
function parseV14(claim: Claim): Parsed {
  const base = parseV13(claim);
  const c = claim as Partial<FlatClaim> & Partial<ScanBackClaim> & Partial<CoopClaim> & Partial<PortalV2Claim>;
  if (Array.isArray(c.line_items)) {
    base.claimed = c.line_items.reduce((s, li) => s + (li.deduction ?? 0), 0);
    base.cases = c.line_items.reduce((s, li) => s + (li.units ?? 0), 0);
    base.invoice = c.invoice_no ?? c.invoice_refs?.[0];
    base.promoCode = base.promoCode ?? c.line_items[0]?.promotion.ref;
    base.promoType = c.line_items[0]?.promotion.type;
  }
  if (c.promo_type === "scan-back") {
    base.cases = c.units_scanned ?? 0;
    base.period = c.scan_period;
  }
  if (c.coop_program) {
    base.claimed = c.requested_amt ?? 0;
    base.period = c.ad_run;
    base.proof = c.proof_of_performance;
    base.promoType = PROMO_TYPES.COOP;
  }
  return base;
}

function decide(p: Parsed, ctx: AgentContext, opts: { fx: boolean; coop: boolean; graceDays: number; tolerance: number }): AgentOutput {
  if (!p.promoCode) return { decision: "ESCALATE", amount: 0, reason: "no promo code on claim" };
  const contract = CONTRACTS_BY_CODE.get(p.promoCode);
  if (!contract) return { decision: "ESCALATE", amount: 0, reason: `unknown promo code ${p.promoCode}` };
  if (contract.promo_type === PROMO_TYPES.COOP) {
    if (!opts.coop) return { decision: "ESCALATE", amount: 0, reason: "co-op claim without invoice; needs analyst" };
    if (!p.proof) return { decision: "ESCALATE", amount: 0, reason: "co-op claim missing proof of performance" };
    if (!p.period || !within(contract.period, p.period.start, p.period.end, opts.graceDays)) {
      return { decision: "REJECT", amount: 0, reason: "ad run outside co-op program window" };
    }
    return { decision: "APPROVE", amount: round2(p.claimed), reason: `co-op proof on file (${p.proof.slice(0, 24)}); within program window` };
  }
  if (!p.invoice) return { decision: "ESCALATE", amount: 0, reason: "claim has no invoice reference" };
  if (ctx.seenInvoices.has(p.invoice)) return { decision: "REJECT", amount: 0, reason: `duplicate of invoice ${p.invoice}` };
  ctx.seenInvoices.add(p.invoice);
  if (!p.period || !within(contract.period, p.period.start, p.period.end, opts.graceDays)) {
    return { decision: "REJECT", amount: 0, reason: `claim period outside contract ${contract.promo_code}` };
  }
  let claimed = p.claimed;
  if (p.currency !== contract.currency) {
    if (!opts.fx) {
      return decideAgainstAllowed(claimed, p.cases * contract.rate, opts.tolerance);
    }
    claimed = claimed * ((FX_TO_USD[p.currency] ?? 1) / (FX_TO_USD[contract.currency] ?? 1));
  }
  const allowed = p.cases * contract.rate;
  return decideAgainstAllowed(claimed, allowed, opts.tolerance);
}

export const AGENT_VERSIONS: AgentVersion[] = [
  {
    version: "1.3.0",
    release_tag: "release/1.3",
    summary: "September deployment. Flat claim parser; off-invoice, bill-back and display contracts.",
    patch: "",
    run: (claim, ctx) => decide(parseV13(claim), ctx, { fx: false, coop: false, graceDays: PERIOD_GRACE_DAYS, tolerance: OVERCLAIM_TOLERANCE }),
  },
  {
    version: "1.4.0",
    release_tag: "release/1.4",
    summary: "Walk portal-v2 line items; add scan-back and co-op proof-of-performance handling.",
    patch: `--- a/agent/parse.ts
+++ b/agent/parse.ts
@@ function parseClaim(claim) {
   const base = parseFlat(claim);
+  if (Array.isArray(claim.line_items)) {
+    base.claimed = claim.line_items.reduce((s, li) => s + li.deduction, 0);
+    base.cases = claim.line_items.reduce((s, li) => s + li.units, 0);
+    base.promoType = claim.line_items[0]?.promotion.type;
+  }
+  if (claim.promo_type === "scan-back") {
+    base.cases = claim.units_scanned;
+    base.period = claim.scan_period;
+  }
+  if (claim.coop_program) {
+    base.claimed = claim.requested_amt;
+    base.period = claim.ad_run;
+    base.proof = claim.proof_of_performance;
+  }
   return base;
 }`,
    run: (claim, ctx) => decide(parseV14(claim), ctx, { fx: false, coop: true, graceDays: PERIOD_GRACE_DAYS, tolerance: OVERCLAIM_TOLERANCE }),
  },
  {
    version: "1.5.0",
    release_tag: "release/1.5",
    summary: "Finance review: tighten over-claim tolerance from 2% to 1%; allow a two-day grace on period boundaries.",
    patch: `--- a/agent/policy.ts
+++ b/agent/policy.ts
-const OVERCLAIM_TOLERANCE = 0.02;
-const PERIOD_GRACE_DAYS = 0;
+const OVERCLAIM_TOLERANCE = 0.01;
+const PERIOD_GRACE_DAYS = 2;`,
    run: (claim, ctx) => decide(parseV14(claim), ctx, { fx: false, coop: true, graceDays: 2, tolerance: 0.01 }),
  },
];

export function agentByVersion(version: string): AgentVersion {
  const v = AGENT_VERSIONS.find((a) => a.version === version);
  if (!v) throw new Error(`unknown agent version ${version}`);
  return v;
}

export function runAgent(version: string, claims: Claim[]): AgentOutput[] {
  const agent = agentByVersion(version);
  const ctx = newContext();
  return claims.map((c) => agent.run(c, ctx));
}
