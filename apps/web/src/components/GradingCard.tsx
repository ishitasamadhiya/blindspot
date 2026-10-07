import React, { useEffect, useState } from "react";
import type { Decision, Trace } from "@blindspot/core";
import { ClaimJson } from "./ClaimJson";
import { moneyFull } from "../lib/format";

export interface GradingItemView {
  item_id: string;
  cluster_id: string;
  cluster_name: string;
  trace_id: string;
  role: string;
  status: "pending" | "graded";
  judge: { pass: boolean; confidence: number; rationale: string; judge: string } | null;
  expert: { decision: Decision; amount: number; note: string; grader: string; graded_at: string } | null;
  trace?: Trace;
}

export const GradingCard: React.FC<{
  item: GradingItemView;
  index: number;
  total: number;
  onGrade?: (g: { decision: Decision; amount: number; note: string }) => Promise<void> | void;
  onSkip?: () => void;
  highlight?: string[];
  busy?: boolean;
  prefill?: { decision: Decision; amount: number | string } | null;
}> = ({ item, index, total, onGrade, onSkip, highlight = [], busy = false, prefill = null }) => {
  const [decision, setDecision] = useState<Decision | null>(prefill?.decision ?? null);
  const [amount, setAmount] = useState<string>(prefill ? String(prefill.amount) : "");
  const [note, setNote] = useState("");
  useEffect(() => {
    setDecision(prefill?.decision ?? null);
    setAmount(prefill ? String(prefill.amount) : "");
    setNote("");
  }, [item.item_id, prefill]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "a") setDecision("APPROVE");
      if (e.key === "r") setDecision("REJECT");
      if (e.key === "e") setDecision("ESCALATE");
      if (e.key === "Enter" && tag !== "BUTTON" && tag !== "A" && decision && onGrade && !busy && item.status !== "graded") {
        e.preventDefault();
        void onGrade({ decision, amount: decision === "APPROVE" ? Number(amount) || 0 : 0, note });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decision, amount, note, onGrade, busy, item.status]);
  const t = item.trace;
  if (!t) return <div className="empty">trace missing</div>;
  const isSim = item.judge?.judge.startsWith("simulated");
  return (
    <div className="grading">
      <div className="card">
        <div className="card-head">
          <div>
            <h2>
              Case {index + 1} of {total} <span className="faint">· {item.cluster_id} · {item.cluster_name}</span>
            </h2>
            <div className="small muted">
              {t.trace_id} · {(t.claim as { retailer: string }).retailer} · picked as <span className="badge neutral">{item.role}</span>
            </div>
          </div>
          <span className={`badge ${item.status === "graded" ? "pass" : "neutral"}`}>{item.status}</span>
        </div>
        <ClaimJson claim={t.claim} highlight={highlight} maxHeight={380} focusable />
        <div className="section">
          <div className="small muted" style={{ marginBottom: 6 }}>
            Agent {t.agent_version} returned
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className={`badge ${t.output.decision.toLowerCase()}`}>{t.output.decision}</span>
            <b className="num">{moneyFull(t.output.amount)}</b>
            <span className="muted small">{t.output.reason}</span>
          </div>
          {t.signals.overridden || t.signals.escalated ? (
            <div className="small" style={{ marginTop: 6, color: "var(--warning)" }}>
              production signal: {t.signals.overridden ? `analyst overrode to ${t.signals.analyst_decision} ${t.signals.analyst_amount !== undefined ? moneyFull(t.signals.analyst_amount) : ""}` : "escalated to analyst queue"}
            </div>
          ) : null}
        </div>
      </div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {item.judge ? (
          <div>
            <div className="small muted" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Pre-grade by {isSim ? <span className="badge warn">simulated judge</span> : <span className="badge accent">{item.judge.judge}</span>}</span>
              <span className="num">confidence {item.judge.confidence.toFixed(2)}</span>
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
              <span className={`badge ${item.judge.pass ? "pass" : "blocked"}`}>{item.judge.pass ? "agent correct" : "agent wrong"}</span>
              <span className="small muted">{item.judge.rationale}</span>
            </div>
          </div>
        ) : (
          <div className="small muted">No judge pre-grade; routed straight to you.</div>
        )}
        <div>
          <div className="small muted" style={{ marginBottom: 6 }}>
            Your decision <span className="faint">(keys: a / r / e, Enter to submit)</span>
          </div>
          <div
            className="decision-row"
            role="radiogroup"
            aria-label="expert decision"
            onKeyDown={(e) => {
              const order: Decision[] = ["APPROVE", "REJECT", "ESCALATE"];
              const i = Math.max(0, order.indexOf(decision ?? "APPROVE"));
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                const next = order[(i + 1) % order.length] as Decision;
                setDecision(next);
                (e.currentTarget.querySelector(`[data-decision="${next}"]`) as HTMLButtonElement | null)?.focus();
              }
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                const prev = order[(i - 1 + order.length) % order.length] as Decision;
                setDecision(prev);
                (e.currentTarget.querySelector(`[data-decision="${prev}"]`) as HTMLButtonElement | null)?.focus();
              }
            }}
          >
            {(["APPROVE", "REJECT", "ESCALATE"] as Decision[]).map((d, i) => (
              <button
                key={d}
                type="button"
                role="radio"
                data-decision={d}
                aria-checked={decision === d}
                tabIndex={decision === d || (!decision && i === 0) ? 0 : -1}
                className={`btn ${decision === d ? `selected ${d.toLowerCase()}` : ""}`}
                onClick={() => setDecision(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        {decision === "APPROVE" ? (
          <div className="field">
            <label htmlFor="amount">Reimbursable amount (USD)</label>
            <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="note">Note for the golden set</label>
          <textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="why this is the right answer" />
        </div>
        <div className="actions" style={{ marginTop: "auto" }}>
          <button type="button" className="btn primary" disabled={!decision || busy || item.status === "graded"} onClick={() => decision && onGrade && void onGrade({ decision, amount: decision === "APPROVE" ? Number(amount) || 0 : 0, note })}>
            {item.status === "graded" ? "Graded" : "Submit grade"}
          </button>
          {onSkip ? (
            <button type="button" className="btn ghost" onClick={onSkip}>
              Skip
            </button>
          ) : null}
          {item.expert ? (
            <span className="small muted">
              {item.expert.grader}: {item.expert.decision} {item.expert.decision === "APPROVE" ? moneyFull(item.expert.amount) : ""}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
