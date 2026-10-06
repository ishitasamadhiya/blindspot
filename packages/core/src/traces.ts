import type { Trace } from "./types.js";

export function claimedAmount(trace: Trace): number {
  const c = trace.claim as unknown as Record<string, unknown>;
  if (typeof c.deduction_amt === "number") return c.deduction_amt;
  if (typeof c.requested_amt === "number") return c.requested_amt;
  if (Array.isArray(c.line_items)) return (c.line_items as Array<{ deduction: number }>).reduce((s, li) => s + li.deduction, 0);
  return 0;
}

export function hasFailureSignal(trace: Trace): boolean {
  const zeroDollarApproval = trace.output.decision === "APPROVE" && trace.output.amount === 0;
  return trace.signals.overridden || trace.signals.escalated || !!trace.signals.tool_error || zeroDollarApproval;
}
