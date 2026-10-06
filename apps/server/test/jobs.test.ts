import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { EventBus } from "../src/events.js";
import { JobRunner } from "../src/jobs.js";

describe("durable job runner", () => {
  it("checkpoints each step and resumes at the failed step without re-running finished ones", async () => {
    const db = openDb(":memory:");
    const bus = new EventBus();
    const runs: string[] = [];
    let failOnce = true;
    const define = (runner: JobRunner) =>
      runner.register<{ n: number }>({
        type: "demo",
        label: () => "demo",
        steps: () => [
          { name: "one", run: ({ checkpoint }) => { runs.push("one"); checkpoint.one = 1; } },
          { name: "two", run: ({ checkpoint }) => { runs.push("two"); if (failOnce) { failOnce = false; throw new Error("boom"); } checkpoint.two = (checkpoint.one as number) + 1; } },
          { name: "three", run: ({ checkpoint }) => { runs.push("three"); checkpoint.three = (checkpoint.two as number) + 1; } },
        ],
        finish: (_i, c) => c.three,
      });
    const runner = new JobRunner(db, bus);
    define(runner);
    const job = runner.enqueue("demo", { n: 1 });
    const failed = await runner.wait(job.job_id);
    expect(failed.status).toBe("failed");
    expect(failed.steps.map((s) => s.status)).toEqual(["done", "failed", "pending"]);
    expect(failed.checkpoint.one).toBe(1);

    // a fresh runner over the same database sees the persisted job and resumes it
    const runner2 = new JobRunner(db, bus);
    define(runner2);
    runner2.retry(job.job_id);
    const done = await runner2.wait(job.job_id);
    expect(done.status).toBe("complete");
    expect(done.result).toBe(3);
    expect(runs).toEqual(["one", "two", "two", "three"]);
  });

  it("resumes jobs that were still running when the process died", async () => {
    const db = openDb(":memory:");
    const bus = new EventBus();
    const runner = new JobRunner(db, bus);
    runner.register<Record<string, never>>({ type: "slow", label: () => "slow", steps: () => [{ name: "a", run: ({ checkpoint }) => { checkpoint.a = true; } }], finish: () => "ok" });
    const job = runner.enqueue("slow", {});
    await runner.wait(job.job_id);
    db.prepare("UPDATE jobs SET status = 'running' WHERE job_id = ?").run(job.job_id);
    const runner2 = new JobRunner(db, bus);
    runner2.register<Record<string, never>>({ type: "slow", label: () => "slow", steps: () => [{ name: "a", run: () => { throw new Error("should not re-run a finished step"); } }], finish: () => "resumed" });
    expect(runner2.resumeIncomplete()).toBe(1);
    const after = await runner2.wait(job.job_id);
    expect(after.status).toBe("complete");
    expect(after.result).toBe("resumed");
  });
});
