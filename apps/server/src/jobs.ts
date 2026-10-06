import type { Db } from "./db.js";
import { json, newId, nowIso } from "./db.js";
import type { EventBus } from "./events.js";

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface JobStep {
  name: string;
  status: StepStatus;
  started_at?: string;
  finished_at?: string;
  note?: string;
}

export interface JobRecord<I = unknown, R = unknown> {
  job_id: string;
  type: string;
  status: "queued" | "running" | "complete" | "failed";
  label: string;
  steps: JobStep[];
  checkpoint: Record<string, unknown>;
  input: I;
  result: R | null;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export interface StepContext {
  checkpoint: Record<string, unknown>;
  note: (text: string) => void;
  progress: () => void;
}

export type StepFn = (ctx: StepContext) => Promise<void> | void;

export interface JobDefinition<I> {
  type: string;
  label: (input: I) => string;
  steps: (input: I) => Array<{ name: string; run: StepFn }>;
  finish: (input: I, checkpoint: Record<string, unknown>) => unknown;
}

/**
 * A small durable job runner. Every step checkpoints into SQLite before the
 * next one starts, so a job interrupted by a crash or restart resumes at the
 * first unfinished step instead of starting over. Steps must therefore be
 * idempotent, which is the same contract Temporal activities and Azure Durable
 * Functions impose; in production this runner is the thing you swap out.
 */
export class JobRunner {
  private defs = new Map<string, JobDefinition<unknown>>();
  private running = new Map<string, Promise<void>>();

  constructor(
    private db: Db,
    private bus: EventBus,
  ) {}

  register<I>(def: JobDefinition<I>): void {
    this.defs.set(def.type, def as JobDefinition<unknown>);
  }

  list(): JobRecord[] {
    return (this.db.prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50").all() as Array<Record<string, unknown>>).map(rowToJob);
  }

  get(jobId: string): JobRecord | undefined {
    const row = this.db.prepare("SELECT * FROM jobs WHERE job_id = ?").get(jobId) as Record<string, unknown> | undefined;
    return row ? rowToJob(row) : undefined;
  }

  enqueue<I>(type: string, input: I): JobRecord<I> {
    const def = this.defs.get(type);
    if (!def) throw new Error(`no job definition for ${type}`);
    const job: JobRecord<I> = {
      job_id: newId("job"),
      type,
      status: "queued",
      label: def.label(input),
      steps: def.steps(input).map((s) => ({ name: s.name, status: "pending" })),
      checkpoint: {},
      input,
      result: null,
      error: null,
      attempts: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    this.save(job);
    this.bus.emit("job", job);
    void this.start(job.job_id);
    return job;
  }

  async wait(jobId: string): Promise<JobRecord> {
    const p = this.running.get(jobId);
    if (p) await p;
    return this.get(jobId) as JobRecord;
  }

  resumeIncomplete(): number {
    const rows = this.db.prepare("SELECT job_id FROM jobs WHERE status IN ('queued','running')").all() as Array<{ job_id: string }>;
    for (const r of rows) void this.start(r.job_id);
    return rows.length;
  }

  private async start(jobId: string): Promise<void> {
    if (this.running.has(jobId)) return;
    const p = this.execute(jobId).finally(() => this.running.delete(jobId));
    this.running.set(jobId, p);
    await p;
  }

  private async execute(jobId: string): Promise<void> {
    const job = this.get(jobId);
    if (!job) return;
    const def = this.defs.get(job.type);
    if (!def) return;
    job.status = "running";
    job.attempts += 1;
    this.save(job);
    this.bus.emit("job", job);
    const steps = def.steps(job.input);
    try {
      for (let i = 0; i < steps.length; i++) {
        const stepDef = steps[i] as { name: string; run: StepFn };
        const step = job.steps[i] as JobStep;
        if (step.status === "done") continue;
        step.status = "running";
        step.started_at = nowIso();
        this.save(job);
        this.bus.emit("job", job);
        await stepDef.run({
          checkpoint: job.checkpoint,
          note: (text) => {
            step.note = text;
          },
          progress: () => {
            this.save(job);
            this.bus.emit("job", job);
          },
        });
        step.status = "done";
        step.finished_at = nowIso();
        this.save(job);
        this.bus.emit("job", job);
      }
      job.result = def.finish(job.input, job.checkpoint);
      job.status = "complete";
      this.save(job);
      this.bus.emit("job", job);
      this.bus.emit(`job:${job.type}:complete`, job);
    } catch (err) {
      const running = job.steps.find((s) => s.status === "running");
      if (running) running.status = "failed";
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      this.save(job);
      this.bus.emit("job", job);
    }
  }

  retry(jobId: string): JobRecord | undefined {
    const job = this.get(jobId);
    if (!job || job.status !== "failed") return job;
    for (const s of job.steps) if (s.status === "failed") s.status = "pending";
    job.status = "queued";
    job.error = null;
    this.save(job);
    void this.start(job.job_id);
    return job;
  }

  private save(job: JobRecord): void {
    job.updated_at = nowIso();
    this.db
      .prepare(
        `INSERT INTO jobs(job_id,type,status,label,steps,checkpoint,input,result,error,attempts,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(job_id) DO UPDATE SET status=excluded.status, steps=excluded.steps, checkpoint=excluded.checkpoint,
           result=excluded.result, error=excluded.error, attempts=excluded.attempts, updated_at=excluded.updated_at`,
      )
      .run(
        job.job_id,
        job.type,
        job.status,
        job.label,
        JSON.stringify(job.steps),
        JSON.stringify(job.checkpoint),
        JSON.stringify(job.input),
        job.result === null ? null : JSON.stringify(job.result),
        job.error,
        job.attempts,
        job.created_at,
        job.updated_at,
      );
  }
}

function rowToJob(row: Record<string, unknown>): JobRecord {
  return {
    job_id: row.job_id as string,
    type: row.type as string,
    status: row.status as JobRecord["status"],
    label: row.label as string,
    steps: json(row.steps),
    checkpoint: json(row.checkpoint),
    input: json(row.input),
    result: row.result ? json(row.result) : null,
    error: (row.error as string | null) ?? null,
    attempts: row.attempts as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
