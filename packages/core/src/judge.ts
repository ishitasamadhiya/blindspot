import { CONTRACTS_BY_CODE } from "./contracts.js";
import { rngFor } from "./prng.js";
import type { AgentOutput, Claim, FlatClaim } from "./types.js";

export interface JudgeVerdict {
  pass: boolean;
  confidence: number;
  rationale: string;
  judge: string;
}

export interface Judge {
  readonly name: string;
  grade(claim: Claim, output: AgentOutput): Promise<JudgeVerdict>;
}

/**
 * Stand-in for an LLM judge in offline demo mode. It re-derives a verdict
 * from the fields it recognises (the flat Contoso shape), so it is confident
 * and mostly right on familiar claims and visibly unsure on unfamiliar ones.
 * Its mistakes are deliberate: a judge that was never validated on a new claim
 * shape should not be trusted there, and the grading queue measures exactly that.
 */
export class SimulatedJudge implements Judge {
  readonly name = "simulated-judge";

  async grade(claim: Claim, output: AgentOutput): Promise<JudgeVerdict> {
    const c = claim as Partial<FlatClaim>;
    const rng = rngFor(`judge:${(claim as { claim_id: string }).claim_id}:${output.decision}:${output.amount}`);
    const recognised = typeof c.deduction_amt === "number" && typeof c.cases === "number" && !!c.invoice_no && !!c.promo_code;
    const contract = c.promo_code ? CONTRACTS_BY_CODE.get(c.promo_code) : undefined;
    if (!recognised || !contract) {
      const pass = rng() < 0.55;
      return {
        pass,
        confidence: 0.35 + rng() * 0.25,
        rationale: "Claim fields do not match the deduction rubric I was given; cannot verify the amount.",
        judge: this.name,
      };
    }
    const allowed = (c.cases as number) * contract.rate;
    const claimed = c.deduction_amt as number;
    let expected: AgentOutput["decision"];
    if (claimed <= allowed * 1.02) expected = "APPROVE";
    else if (claimed <= allowed * 1.25) expected = "APPROVE";
    else expected = "REJECT";
    const agrees = expected === output.decision;
    const flip = rng() < 0.08;
    const pass = flip ? !agrees : agrees;
    return {
      pass,
      confidence: 0.78 + rng() * 0.2,
      rationale: pass
        ? `Decision consistent with contract ${contract.promo_code} (${contract.rate}/case, allowed ${allowed.toFixed(2)}).`
        : `Expected ${expected} against allowed ${allowed.toFixed(2)}; agent returned ${output.decision}.`,
      judge: this.name,
    };
  }
}
