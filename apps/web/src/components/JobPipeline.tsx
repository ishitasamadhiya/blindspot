import React from "react";

export interface JobStepView {
  name: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  note?: string;
}
export interface JobView {
  job_id: string;
  type: string;
  status: "queued" | "running" | "complete" | "failed";
  label: string;
  steps: JobStepView[];
  error?: string | null;
  created_at: string;
}

export const JobPipeline: React.FC<{ job: JobView; compact?: boolean }> = ({ job, compact = false }) => (
  <div>
    {!compact ? (
      <div className="card-head" style={{ marginBottom: 8 }}>
        <div>
          <b>{job.label}</b>
          <div className="small faint">
            durable job {job.job_id} · {job.status}
            {job.error ? ` · ${job.error}` : ""}
          </div>
        </div>
        <span className={`badge ${job.status === "complete" ? "pass" : job.status === "failed" ? "blocked" : "accent"}`}>{job.status}</span>
      </div>
    ) : null}
    <div className="pipeline" role="list" aria-live="polite" aria-label={`job steps for ${job.label}`}>
      {job.steps.map((s, i) => (
        <div key={i} className={`step ${s.status}`} role="listitem">
          <div className="name">
            {s.status === "running" ? <span className="spinner" role="img" aria-label="running" /> : s.status === "done" ? "✓" : s.status === "failed" ? "✗" : `${i + 1}`}
            {s.name}
          </div>
          {!compact ? <div className="note">{s.note ?? ""}</div> : null}
        </div>
      ))}
    </div>
  </div>
);
