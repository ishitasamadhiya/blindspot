import type { PromoContract } from "./types.js";

export const RETAILERS = [
  { id: "R-1001", name: "Northwind Traders", short: "NW" },
  { id: "R-1002", name: "Fabrikam Grocers", short: "FB" },
  { id: "R-1003", name: "Tailwind Markets", short: "TW" },
] as const;

export type RetailerShort = (typeof RETAILERS)[number]["short"];

export const PROMO_TYPES = {
  OI: "off-invoice",
  BB: "bill-back",
  DISP: "display-allowance",
  SB: "scan-back",
  COOP: "co-op-advertising",
} as const;

function contract(
  short: RetailerShort,
  kind: keyof typeof PROMO_TYPES,
  start: string,
  end: string,
  rate: number,
  currency = "USD",
): PromoContract {
  const retailer = RETAILERS.find((r) => r.short === short);
  if (!retailer) throw new Error(`unknown retailer ${short}`);
  return {
    promo_code: `${short}-${kind}-${start}`,
    retailer_id: retailer.id,
    promo_type: PROMO_TYPES[kind],
    rate,
    period: { start, end },
    currency,
  };
}

/** Contoso Foods' trade-promotion contracts for 2026. Rates are per case (or per unit for scan-back, percent for co-op). */
export const CONTRACTS: PromoContract[] = [
  contract("NW", "OI", "2026-06-01", "2026-06-30", 2.4),
  contract("NW", "OI", "2026-07-06", "2026-08-02", 2.75),
  contract("NW", "BB", "2026-07-13", "2026-08-09", 1.8),
  contract("NW", "DISP", "2026-08-03", "2026-08-30", 150),
  contract("NW", "OI", "2026-09-07", "2026-10-04", 2.6),
  contract("NW", "BB", "2026-09-14", "2026-10-11", 1.95),
  contract("NW", "SB", "2026-09-28", "2026-10-25", 0.35),
  contract("FB", "OI", "2026-06-08", "2026-07-05", 2.1),
  contract("FB", "BB", "2026-06-22", "2026-07-19", 1.6),
  contract("FB", "DISP", "2026-07-20", "2026-08-16", 120),
  contract("FB", "OI", "2026-08-17", "2026-09-13", 2.3),
  contract("FB", "OI", "2026-09-14", "2026-10-11", 2.3),
  contract("FB", "BB", "2026-09-21", "2026-10-18", 1.7),
  contract("FB", "COOP", "2026-09-28", "2026-12-20", 0.5),
  contract("TW", "OI", "2026-06-15", "2026-07-12", 1.95),
  contract("TW", "BB", "2026-07-27", "2026-08-23", 1.5),
  contract("TW", "DISP", "2026-08-10", "2026-09-06", 90),
  contract("TW", "OI", "2026-09-07", "2026-10-04", 2.05),
  contract("TW", "BB", "2026-09-28", "2026-10-25", 1.55),
];

export const CONTRACTS_BY_CODE: ReadonlyMap<string, PromoContract> = new Map(CONTRACTS.map((c) => [c.promo_code, c]));

export const FX_TO_USD: Record<string, number> = { USD: 1, CAD: 0.73 };
