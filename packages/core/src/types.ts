export type Decision = "APPROVE" | "REJECT" | "ESCALATE";

export type ClaimFormat = "flat-v1" | "portal-v2" | "scan-back" | "coop" | "flat-v1-cad";

export interface Period {
  start: string;
  end: string;
}

export interface FlatClaim {
  claim_id: string;
  retailer: string;
  retailer_id: string;
  submitted_at: string;
  invoice_no: string;
  promo_code: string;
  promo_type: string;
  period: Period;
  cases: number;
  deduction_amt: number;
  currency: string;
  deduction_code: string;
  supporting_refs: string[];
  notes?: string;
}

export interface PortalV2LineItem {
  sku: string;
  units: number;
  deduction: number;
  promotion: { ref: string; type: string };
}

export interface PortalV2Claim {
  claim_id: string;
  retailer: string;
  retailer_id: string;
  submitted_at: string;
  export_version: "v2";
  invoice_no: string;
  invoice_refs: string[];
  promo_code: string;
  period: Period;
  currency: string;
  line_items: PortalV2LineItem[];
  bundle: boolean;
}

export interface ScanBackClaim {
  claim_id: string;
  retailer: string;
  retailer_id: string;
  submitted_at: string;
  invoice_no: string;
  promo_code: string;
  promo_type: "scan-back";
  scan_period: Period;
  units_scanned: number;
  reimburse_rate_per_unit: number;
  deduction_amt: number;
  currency: string;
  deduction_code: string;
  supporting_refs: string[];
}

export interface CoopClaim {
  claim_id: string;
  retailer: string;
  retailer_id: string;
  submitted_at: string;
  coop_program: string;
  promo_code: string;
  ad_run: Period;
  proof_of_performance: string;
  requested_amt: number;
  currency: string;
  deduction_code: string;
  notes?: string;
}

export type Claim = FlatClaim | PortalV2Claim | ScanBackClaim | CoopClaim;

export interface AgentOutput {
  decision: Decision;
  amount: number;
  reason: string;
}

export interface Signals {
  analyst_decision?: Decision;
  analyst_amount?: number;
  overridden: boolean;
  escalated: boolean;
  tool_error?: string;
  latency_ms: number;
}

export interface Trace {
  trace_id: string;
  received_at: string;
  agent_version: string;
  claim: Claim;
  output: AgentOutput;
  signals: Signals;
}

export interface Expected {
  decision: Decision;
  amount: number;
}

export interface GoldenCase {
  case_id: string;
  claim: Claim;
  expected: Expected;
  source: "historical" | "harvested";
  cluster_id?: string;
  cluster_name?: string;
  graded_by: string;
  graded_at: string;
}

export interface GoldenVersion {
  version: string;
  created_at: string;
  parent?: string;
  case_ids: string[];
  sha256: string;
  note: string;
}

export interface PromoContract {
  promo_code: string;
  retailer_id: string;
  promo_type: string;
  rate: number;
  period: Period;
  currency: string;
}

export interface CaseResult {
  case_id: string;
  output: AgentOutput;
  pass: boolean;
  cluster_id?: string;
}

export interface Interval {
  estimate: number;
  lo: number;
  hi: number;
  n: number;
  n_boot: number;
}

export interface SegmentMetric {
  key: string;
  label: string;
  n: number;
  pass_rate: number;
}

export interface EvalMetrics {
  n: number;
  accuracy: Interval;
  by_cluster: SegmentMetric[];
  by_retailer: SegmentMetric[];
  by_source: SegmentMetric[];
  delta_vs_baseline?: Interval & { baseline_run_id: string };
}

export interface EvalRun {
  run_id: string;
  created_at: string;
  golden_version: string;
  agent_version: string;
  release_tag: string;
  baseline_run_id?: string;
  status: "queued" | "running" | "complete" | "partial" | "failed";
  results: CaseResult[];
  metrics?: EvalMetrics;
}

export interface GateCheck {
  name: string;
  pass: boolean;
  value: number | null;
  threshold: number;
  detail: string;
}

export interface GateResult {
  run_id: string;
  status: "PASS" | "BLOCKED";
  checks: GateCheck[];
  evaluated_at: string;
}

export interface CoverageHit {
  trace_id: string;
  nearest_case_id: string;
  similarity: number;
  covered: boolean;
}

export interface BlindSpot {
  cluster_id: string;
  name: string;
  tokens: string[];
  trace_ids: string[];
  volume: number;
  volume_share: number;
  failure_rate: number;
  novelty: number;
  score: number;
  value_at_risk: number;
  retailers: Record<string, number>;
  medoid_trace_id: string;
}

export interface MapPoint {
  id: string;
  kind: "golden" | "covered" | "uncovered";
  x: number;
  y: number;
  cluster_id?: string;
}
