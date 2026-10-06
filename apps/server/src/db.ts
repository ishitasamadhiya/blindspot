import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS golden_cases (
  case_id TEXT PRIMARY KEY, version_added TEXT NOT NULL, claim TEXT NOT NULL, expected TEXT NOT NULL,
  source TEXT NOT NULL, cluster_id TEXT, cluster_name TEXT, graded_by TEXT NOT NULL, graded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS golden_versions (
  version TEXT PRIMARY KEY, created_at TEXT NOT NULL, parent TEXT, case_ids TEXT NOT NULL, sha256 TEXT NOT NULL, note TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS traces (
  trace_id TEXT PRIMARY KEY, received_at TEXT NOT NULL, agent_version TEXT NOT NULL, claim TEXT NOT NULL,
  output TEXT NOT NULL, signals TEXT NOT NULL, ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS traces_received_at ON traces(received_at);
CREATE TABLE IF NOT EXISTS seed_truth (trace_id TEXT PRIMARY KEY, expected TEXT NOT NULL, format TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seed_pending (trace_id TEXT PRIMARY KEY, received_at TEXT NOT NULL, trace TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS coverage_runs (
  run_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, golden_version TEXT NOT NULL, window_start TEXT NOT NULL, window_end TEXT NOT NULL,
  embedder TEXT NOT NULL, judge TEXT NOT NULL, threshold REAL NOT NULL, coverage REAL NOT NULL, covered INTEGER NOT NULL, total INTEGER NOT NULL,
  analysis TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS grading_items (
  item_id TEXT PRIMARY KEY, coverage_run_id TEXT NOT NULL, cluster_id TEXT NOT NULL, cluster_name TEXT NOT NULL, trace_id TEXT NOT NULL,
  role TEXT NOT NULL, status TEXT NOT NULL, judge TEXT, expert TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS eval_runs (
  run_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, golden_version TEXT NOT NULL, agent_version TEXT NOT NULL, release_tag TEXT NOT NULL,
  baseline_run_id TEXT, status TEXT NOT NULL, results TEXT NOT NULL, metrics TEXT
);
CREATE TABLE IF NOT EXISTS gates (run_id TEXT PRIMARY KEY, status TEXT NOT NULL, checks TEXT NOT NULL, evaluated_at TEXT NOT NULL, coverage REAL);
CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL, label TEXT NOT NULL, steps TEXT NOT NULL, checkpoint TEXT NOT NULL,
  input TEXT NOT NULL, result TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
`;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

export function resetDb(db: Db): void {
  for (const t of ["meta", "golden_cases", "golden_versions", "traces", "seed_truth", "seed_pending", "coverage_runs", "grading_items", "eval_runs", "gates", "jobs"]) {
    db.exec(`DELETE FROM ${t}`);
  }
}

export function getMeta(db: Db, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMeta(db: Db, key: string, value: string): void {
  db.prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function json<T>(value: unknown): T {
  return JSON.parse(value as string) as T;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 0xffffff).toString(36).padStart(5, "0");
  return `${prefix}_${t}${r}`;
}
