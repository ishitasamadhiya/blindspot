import { AGENT_VERSIONS, newContext } from "./agent.js";
import { CONTRACTS, CONTRACTS_BY_CODE, FX_TO_USD, PROMO_TYPES, RETAILERS } from "./contracts.js";
import { casePasses } from "./golden.js";
import { mulberry32, pick, randInt, type Rng } from "./prng.js";
import type { Claim, ClaimFormat, CoopClaim, Expected, FlatClaim, GoldenCase, PortalV2Claim, PromoContract, ScanBackClaim, Trace } from "./types.js";

export interface SeedData {
  golden: GoldenCase[];
  traces: Trace[];
  truth: Record<string, Expected>;
  formats: Record<string, ClaimFormat>;
  seed: number;
}

const DAY = 86_400_000;
const ANALYSTS = ["analyst:m.okafor", "analyst:j.lindqvist"];
const SKUS = ["CF-GRN-12OZ", "CF-GRN-24OZ", "CF-OAT-18OZ", "CF-OAT-FAM", "CF-CRK-9OZ", "CF-CRK-MULTI", "CF-SNK-6CT", "CF-SNK-12CT"];
const PROOFS = [
  "see attached tearsheet, p.3",
  "circular run 10/02-10/08, tearsheet attached",
  "digital ad screenshots (3) attached",
  "end-cap photo + weekly ad p.1",
  "tearsheet p.2, ad ran in 41 stores",
];

function iso(ms: number): string {
  return new Date(ms).toISOString();
}
function dateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function contractsFor(retailerId: string, type: string, activeAt?: number): PromoContract[] {
  return CONTRACTS.filter(
    (c) =>
      c.retailer_id === retailerId &&
      c.promo_type === type &&
      (activeAt === undefined || (Date.parse(c.period.start) - 7 * DAY <= activeAt && Date.parse(c.period.end) + 21 * DAY >= activeAt)),
  );
}

type Variant = "valid" | "under" | "slight-over" | "big-over" | "period-out" | "grace" | "goodwill" | "rounding";

function pickVariant(rng: Rng): Variant {
  const r = rng();
  if (r < 0.63) return "valid";
  if (r < 0.73) return "under";
  if (r < 0.82) return "slight-over";
  if (r < 0.88) return "big-over";
  if (r < 0.91) return "period-out";
  if (r < 0.95) return "grace";
  if (r < 0.98) return "rounding";
  return "goodwill";
}

interface Built {
  claim: Claim;
  truth: Expected;
  format: ClaimFormat;
}

function periodFor(contract: PromoContract, variant: Variant, rng: Rng): { start: string; end: string } {
  const cs = Date.parse(contract.period.start);
  const ce = Date.parse(contract.period.end);
  if (variant === "period-out") {
    const start = cs + randInt(rng, 10, 20) * DAY;
    return { start: dateOnly(start), end: dateOnly(ce + randInt(rng, 6, 14) * DAY) };
  }
  if (variant === "grace") {
    const start = cs + randInt(rng, 0, 5) * DAY;
    return { start: dateOnly(start), end: dateOnly(ce + randInt(rng, 1, 3) * DAY) };
  }
  const start = cs + randInt(rng, 0, 6) * DAY;
  const end = Math.min(ce, start + randInt(rng, 6, 20) * DAY);
  return { start: dateOnly(start), end: dateOnly(end) };
}

function claimedFor(allowed: number, variant: Variant, rng: Rng): number {
  switch (variant) {
    case "under":
      return round2(allowed * (0.82 + rng() * 0.17));
    case "slight-over":
      return round2(allowed * (1.03 + rng() * 0.17));
    case "big-over":
      return round2(allowed * (1.3 + rng() * 0.5));
    case "goodwill":
      return round2(allowed * (1.03 + rng() * 0.05));
    case "rounding":
      return round2(allowed * (1.006 + rng() * 0.014));
    default:
      return round2(allowed * (1 + (rng() - 0.5) * 0.004));
  }
}

function policy(claimed: number, allowed: number, variant: Variant): Expected {
  if (variant === "period-out") return { decision: "REJECT", amount: 0 };
  if (variant === "goodwill") return { decision: "APPROVE", amount: round2(claimed) };
  if (claimed <= allowed * 1.02) return { decision: "APPROVE", amount: round2(claimed) };
  if (claimed <= allowed * 1.25) return { decision: "APPROVE", amount: round2(allowed) };
  return { decision: "REJECT", amount: 0 };
}

let seq = 0;
function nextId(prefix: string, rng: Rng): string {
  seq += 1;
  return `${prefix}-${String(seq).padStart(5, "0")}-${Math.floor(rng() * 9000 + 1000)}`;
}

function buildFlat(rng: Rng, at: number, retailerIdx: number, currency = "USD"): Built {
  const retailer = RETAILERS[retailerIdx] as (typeof RETAILERS)[number];
  const type = pick(rng, [PROMO_TYPES.OI, PROMO_TYPES.OI, PROMO_TYPES.BB, PROMO_TYPES.DISP]);
  const options = contractsFor(retailer.id, type, at);
  const contract = options.length ? pick(rng, options) : (contractsFor(retailer.id, PROMO_TYPES.OI)[0] as PromoContract);
  const variant = pickVariant(rng);
  const cases = contract.promo_type === PROMO_TYPES.DISP ? randInt(rng, 1, 6) : randInt(rng, 40, 900);
  const allowedUsd = cases * contract.rate;
  const claimedUsd = claimedFor(allowedUsd, variant, rng);
  const fx = 1 / (FX_TO_USD[currency] ?? 1);
  const claim: FlatClaim = {
    claim_id: nextId("CLM", rng),
    retailer: retailer.name,
    retailer_id: retailer.id,
    submitted_at: iso(at),
    invoice_no: `INV-${randInt(rng, 400000, 489999)}`,
    promo_code: contract.promo_code,
    promo_type: contract.promo_type,
    period: periodFor(contract, variant, rng),
    cases,
    deduction_amt: round2(claimedUsd * fx),
    currency,
    deduction_code: pick(rng, ["PRM", "PRM", "PRM", "ADV"]),
    supporting_refs: [`DM-${randInt(rng, 10000, 99999)}`, ...(rng() < 0.4 ? [`PO-${randInt(rng, 70000, 79999)}`] : [])],
    ...(rng() < 0.12 ? { notes: pick(rng, ["per buyer email", "short pay on remittance 9/18", "promo per agreement", "see remittance detail"]) } : {}),
  };
  return { claim, truth: policy(claimedUsd, allowedUsd, variant), format: currency === "USD" ? "flat-v1" : "flat-v1-cad" };
}

function buildPortalV2(rng: Rng, at: number): Built {
  const retailer = RETAILERS[0] as (typeof RETAILERS)[number];
  const contract = pick(rng, contractsFor(retailer.id, pick(rng, [PROMO_TYPES.OI, PROMO_TYPES.BB]), at));
  const variant = pickVariant(rng);
  const nLines = rng() < 0.55 ? randInt(rng, 2, 4) : 1;
  let totalUnits = 0;
  const lines: PortalV2Claim["line_items"] = [];
  for (let i = 0; i < nLines; i++) {
    const units = randInt(rng, 24, 420);
    totalUnits += units;
    lines.push({ sku: pick(rng, SKUS), units, deduction: 0, promotion: { ref: contract.promo_code, type: contract.promo_type } });
  }
  const allowed = totalUnits * contract.rate;
  const claimed = claimedFor(allowed, variant, rng);
  let remaining = claimed;
  for (let i = 0; i < lines.length; i++) {
    const li = lines[i] as PortalV2Claim["line_items"][number];
    const share = i === lines.length - 1 ? remaining : round2(claimed * (li.units / totalUnits));
    li.deduction = round2(share);
    remaining = round2(remaining - share);
  }
  const claim: PortalV2Claim = {
    claim_id: nextId("CLM", rng),
    retailer: retailer.name,
    retailer_id: retailer.id,
    submitted_at: iso(at),
    export_version: "v2",
    invoice_no: `INV-${randInt(rng, 490000, 499999)}`,
    invoice_refs: rng() < 0.3 ? [`INV-${randInt(rng, 490000, 499999)}`] : [],
    promo_code: contract.promo_code,
    period: periodFor(contract, variant, rng),
    currency: "USD",
    line_items: lines,
    bundle: nLines > 1,
  };
  return { claim, truth: policy(claimed, allowed, variant), format: "portal-v2" };
}

function buildScanBack(rng: Rng, at: number): Built {
  const retailer = RETAILERS[0] as (typeof RETAILERS)[number];
  const contract = contractsFor(retailer.id, PROMO_TYPES.SB)[0] as PromoContract;
  const variant = pickVariant(rng);
  const units = randInt(rng, 800, 9000);
  const allowed = units * contract.rate;
  const claimed = claimedFor(allowed, variant, rng);
  const claim: ScanBackClaim = {
    claim_id: nextId("CLM", rng),
    retailer: retailer.name,
    retailer_id: retailer.id,
    submitted_at: iso(at),
    invoice_no: `INV-${randInt(rng, 400000, 489999)}`,
    promo_code: contract.promo_code,
    promo_type: "scan-back",
    scan_period: periodFor(contract, variant, rng),
    units_scanned: units,
    reimburse_rate_per_unit: contract.rate,
    deduction_amt: claimed,
    currency: "USD",
    deduction_code: "SBT",
    supporting_refs: [`POS-${randInt(rng, 10000, 99999)}`],
  };
  return { claim, truth: policy(claimed, allowed, variant), format: "scan-back" };
}

function buildCoop(rng: Rng, at: number): Built {
  const retailer = RETAILERS[1] as (typeof RETAILERS)[number];
  const contract = contractsFor(retailer.id, PROMO_TYPES.COOP)[0] as PromoContract;
  const r = rng();
  const variant: Variant = r < 0.82 ? "valid" : r < 0.92 ? "period-out" : "goodwill";
  const requested = round2(1800 + rng() * 9000);
  const claim: CoopClaim = {
    claim_id: nextId("CLM", rng),
    retailer: retailer.name,
    retailer_id: retailer.id,
    submitted_at: iso(at),
    coop_program: "FY27 Q4 Co-op Advertising",
    promo_code: contract.promo_code,
    ad_run: periodFor(contract, variant, rng),
    proof_of_performance: pick(rng, PROOFS),
    requested_amt: requested,
    currency: "USD",
    deduction_code: "COOP",
    ...(rng() < 0.3 ? { notes: pick(rng, ["ad ran per plan", "proof attached", "see weekly ad"]) } : {}),
  };
  const truth: Expected = variant === "period-out" ? { decision: "REJECT", amount: 0 } : { decision: "APPROVE", amount: requested };
  return { claim, truth, format: "coop" };
}

type Slot = { at: number; kind: "flat" | "portal-v2" | "scan-back" | "coop" | "cad" | "dup" };

function schedule(rng: Rng, start: number, days: number): Slot[] {
  const slots: Slot[] = [];
  for (let d = 0; d < days; d++) {
    const dayStart = start + d * DAY;
    const weekday = new Date(dayStart).getUTCDay();
    const volume = weekday === 0 || weekday === 6 ? randInt(rng, 28, 48) : randInt(rng, 150, 190);
    const migrated = d >= 7;
    for (let i = 0; i < volume; i++) {
      const at = dayStart + 8 * 3_600_000 + Math.floor(rng() * 10 * 3_600_000);
      const r = rng();
      let kind: Slot["kind"] = "flat";
      if (migrated) {
        if (r < 0.21) kind = "portal-v2";
        else if (r < 0.3) kind = "scan-back";
        else if (r < 0.38) kind = "coop";
        else if (r < 0.41) kind = "cad";
        else if (r < 0.46) kind = "dup";
      } else {
        if (r < 0.02) kind = "cad";
        else if (r < 0.05) kind = "dup";
      }
      slots.push({ at, kind });
    }
  }
  return slots.sort((a, b) => a.at - b.at);
}

export function generateSeed(seed = 42): SeedData {
  seq = 0;
  const rng = mulberry32(seed);
  const truth: Record<string, Expected> = {};
  const formats: Record<string, ClaimFormat> = {};

  const golden: GoldenCase[] = [];
  const goldenStart = Date.parse("2026-06-08T00:00:00Z");
  for (let i = 0; i < 400; i++) {
    const at = goldenStart + Math.floor(rng() * 84) * DAY + Math.floor(rng() * 9) * 3_600_000;
    const built = buildFlat(rng, at, pick(rng, [0, 0, 0, 1, 1, 2]));
    golden.push({
      case_id: `G-${String(i + 1).padStart(4, "0")}`,
      claim: built.claim,
      expected: built.truth,
      source: "historical",
      graded_by: pick(rng, ANALYSTS),
      graded_at: iso(Date.parse("2026-08-24T15:00:00Z") + Math.floor(rng() * 5) * DAY),
    });
    formats[`G-${String(i + 1).padStart(4, "0")}`] = built.format;
  }

  const trafficStart = Date.parse("2026-09-23T00:00:00Z");
  const slots = schedule(rng, trafficStart, 14);
  const agent = AGENT_VERSIONS[0] as (typeof AGENT_VERSIONS)[number];
  const ctx = newContext();
  const sentInvoices: Array<{ claim: FlatClaim; truth: Expected }> = [];
  const traces: Trace[] = [];
  for (const slot of slots) {
    let built: Built;
    if (slot.kind === "dup" && sentInvoices.length > 20) {
      const original = pick(rng, sentInvoices);
      const resend: FlatClaim = { ...original.claim, claim_id: nextId("CLM", rng), submitted_at: iso(slot.at), supporting_refs: [...original.claim.supporting_refs], notes: "resubmitted; no remittance received" };
      built = { claim: resend, truth: { decision: "REJECT", amount: 0 }, format: "flat-v1" };
    } else if (slot.kind === "portal-v2") built = buildPortalV2(rng, slot.at);
    else if (slot.kind === "scan-back") built = buildScanBack(rng, slot.at);
    else if (slot.kind === "coop") built = buildCoop(rng, slot.at);
    else if (slot.kind === "cad") built = buildFlat(rng, slot.at, 1, "CAD");
    else {
      built = buildFlat(rng, slot.at, pick(rng, [0, 0, 0, 1, 1, 2]));
      sentInvoices.push({ claim: built.claim as FlatClaim, truth: built.truth });
    }
    const t0 = slot.at + randInt(rng, 2_000, 40_000);
    const toolError = rng() < 0.008 ? "contract-lookup timeout (retried 2x)" : undefined;
    const output = toolError ? { decision: "ESCALATE" as const, amount: 0, reason: "tool error: contract lookup unavailable" } : agent.run(built.claim, ctx);
    const escalated = output.decision === "ESCALATE";
    const zeroDollarApproval = output.decision === "APPROVE" && output.amount === 0;
    const reviewed = escalated || zeroDollarApproval ? rng() < (escalated ? 1 : 0.6) : rng() < 0.35;
    const disagrees = !casePasses(built.truth, output);
    const traceId = `T-${String(traces.length + 1).padStart(5, "0")}`;
    traces.push({
      trace_id: traceId,
      received_at: iso(t0),
      agent_version: agent.version,
      claim: built.claim,
      output,
      signals: {
        ...(reviewed ? { analyst_decision: built.truth.decision, analyst_amount: built.truth.amount } : {}),
        overridden: reviewed && disagrees,
        escalated,
        ...(toolError ? { tool_error: toolError } : {}),
        latency_ms: Math.round(Math.exp(6.2 + rng() * 0.9)),
      },
    });
    truth[traceId] = built.truth;
    formats[traceId] = built.format;
  }
  return { golden, traces, truth, formats, seed };
}

export function describeSeed(data: SeedData): Record<string, number> {
  const out: Record<string, number> = { golden: data.golden.length, traces: data.traces.length };
  for (const t of data.traces) {
    const f = data.formats[t.trace_id] ?? "?";
    out[`format:${f}`] = (out[`format:${f}`] ?? 0) + 1;
  }
  out.overridden = data.traces.filter((t) => t.signals.overridden).length;
  out.escalated = data.traces.filter((t) => t.signals.escalated).length;
  return out;
}

export { CONTRACTS_BY_CODE };
