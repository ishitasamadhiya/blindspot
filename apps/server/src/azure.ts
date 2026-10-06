import type { AgentOutput, Claim, Embedder, Judge, JudgeVerdict } from "@blindspot/core";
import { HashingEmbedder, SimulatedJudge, claimToText, normalize } from "@blindspot/core";

export interface AzureConfig {
  endpoint: string;
  apiKey: string;
  embeddingDeployment: string;
  chatDeployment: string;
  apiVersion: string;
}

export function azureConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AzureConfig | null {
  if (!env.AZURE_OPENAI_ENDPOINT || !env.AZURE_OPENAI_API_KEY) return null;
  return {
    endpoint: env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, ""),
    apiKey: env.AZURE_OPENAI_API_KEY,
    embeddingDeployment: env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT ?? "text-embedding-3-small",
    chatDeployment: env.AZURE_OPENAI_CHAT_DEPLOYMENT ?? "gpt-4o-mini",
    apiVersion: env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
  };
}

/** text-embedding-3-small over the claim JSON; falls back to the offline hashing embedder if the call fails. */
export class AzureOpenAIEmbedder implements Embedder {
  readonly name: string;
  readonly dim = 1536;
  private fallback = new HashingEmbedder();
  private degraded = false;
  constructor(
    private cfg: AzureConfig,
    private onFallback: (reason: string) => void = () => {},
  ) {
    this.name = `azure:${cfg.embeddingDeployment}`;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (this.degraded) return this.fallback.embed(texts);
    const out: Float32Array[] = [];
    try {
      for (let i = 0; i < texts.length; i += 64) {
        const batch = texts.slice(i, i + 64).map((t) => {
          try {
            return claimToText(JSON.parse(t) as Claim);
          } catch {
            return t;
          }
        });
        const res = await fetch(`${this.cfg.endpoint}/openai/deployments/${this.cfg.embeddingDeployment}/embeddings?api-version=${this.cfg.apiVersion}`, {
          method: "POST",
          headers: { "content-type": "application/json", "api-key": this.cfg.apiKey },
          body: JSON.stringify({ input: batch }),
        });
        if (!res.ok) throw new Error(`embeddings ${res.status}`);
        const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
        for (const d of data.data) out.push(normalize(Float32Array.from(d.embedding)));
      }
      return out;
    } catch (err) {
      this.degraded = true;
      this.onFallback(`Azure embeddings unavailable (${err instanceof Error ? err.message : String(err)}); using offline hashing embedder`);
      return this.fallback.embed(texts);
    }
  }
}

const RUBRIC = `You are grading a trade-promotion deduction-claim validator for Contoso Foods.
Given the retailer's claim JSON and the agent's decision, decide whether the decision and reimbursable amount are correct under this policy:
- APPROVE at the claimed amount when it is within 2% of cases x contract rate for the promo code and the claim period sits inside the contract period.
- APPROVE at the contract allowance when the claim is over by 2-25%.
- REJECT claims over by more than 25%, outside the contract period, or duplicates of an invoice already claimed.
- ESCALATE when the claim cannot be matched to a contract or invoice.
Reply with JSON only: {"pass": boolean, "confidence": 0..1, "rationale": "one sentence"}. If the claim uses fields you cannot map to the policy, say so and lower your confidence.`;

/** gpt-4o-mini as an LLM judge; falls back to routing everything to experts (no verdicts) if the call fails. */
export class AzureOpenAIJudge implements Judge {
  readonly name: string;
  private fallback = new SimulatedJudge();
  private degraded = false;
  constructor(
    private cfg: AzureConfig,
    private onFallback: (reason: string) => void = () => {},
  ) {
    this.name = `azure:${cfg.chatDeployment}`;
  }

  async grade(claim: Claim, output: AgentOutput): Promise<JudgeVerdict> {
    if (this.degraded) return this.fallback.grade(claim, output);
    try {
      const res = await fetch(`${this.cfg.endpoint}/openai/deployments/${this.cfg.chatDeployment}/chat/completions?api-version=${this.cfg.apiVersion}`, {
        method: "POST",
        headers: { "content-type": "application/json", "api-key": this.cfg.apiKey },
        body: JSON.stringify({
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: RUBRIC },
            { role: "user", content: `CLAIM:\n${claimToText(claim)}\n\nAGENT DECISION: ${output.decision} amount=${output.amount.toFixed(2)} reason=${output.reason}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`chat ${res.status}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      const parsed = JSON.parse(data.choices[0]?.message.content ?? "{}") as Partial<JudgeVerdict>;
      return {
        pass: !!parsed.pass,
        confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
        rationale: parsed.rationale ?? "",
        judge: this.name,
      };
    } catch (err) {
      this.degraded = true;
      this.onFallback(`Azure judge unavailable (${err instanceof Error ? err.message : String(err)}); using simulated judge`);
      return this.fallback.grade(claim, output);
    }
  }
}
