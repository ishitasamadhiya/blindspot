import type { BlindSpot, EvalRun, GateResult, GoldenCase, GoldenVersion, MapPoint, Trace } from "@blindspot/core";

export interface DailyStat {
  day: string;
  volume: number;
  overrides: number;
  escalations: number;
  zero_dollar_approvals: number;
}
export interface Snapshot {
  engagement: { customer: string; agent: string; description: string; deployed: string };
  daily: DailyStat[];
  baseline: { run: EvalRun; gate: GateResult & { coverage: number | null } };
  coverage_v1: { coverage: number; threshold: number; covered: number; total: number; window_start: string; window_end: string; analysis: { blind_spots: BlindSpot[]; map: MapPoint[]; value_at_risk_total: number; trace_count: number } };
  coverage_v2: { coverage: number; analysis: { blind_spots: BlindSpot[] } };
  blind_spots: Array<BlindSpot & { medoid: Trace; examples: Trace[] }>;
  golden_example: GoldenCase;
  grading: Array<{ item_id: string; cluster_id: string; cluster_name: string; trace_id: string; role: string; status: "pending" | "graded"; judge: { pass: boolean; confidence: number; rationale: string; judge: string } | null; expert: { decision: "APPROVE" | "REJECT" | "ESCALATE"; amount: number; note: string; grader: string; graded_at: string } | null; trace?: Trace }>;
  agreement: Array<{ cluster_id: string; cluster_name: string; graded: number; pending: number; agreement: number | null; kappa: number | null; mean_judge_confidence: number | null; expert_pass_rate: number | null }>;
  golden_versions: GoldenVersion[];
  golden_diff: { added: GoldenCase[] };
  runs: { r13_v2: EvalRun; r14: EvalRun; r15: EvalRun };
  gates: { r13_v2: GateResult & { coverage: number | null }; r14: GateResult & { coverage: number | null }; r15: GateResult & { coverage: number | null } };
  agent_versions: Array<{ version: string; release_tag: string; summary: string; patch: string }>;
  jobs: Array<{ job_id: string; type: string; status: "queued" | "running" | "complete" | "failed"; label: string; steps: Array<{ name: string; status: "pending" | "running" | "done" | "failed" | "skipped"; note?: string }>; created_at: string }>;
}
