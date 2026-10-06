import { useCallback, useEffect, useRef, useState } from "react";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* no body */
    }
    throw new Error(message);
  }
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("json") ? res.json() : res.text()) as Promise<T>;
}

export interface BusEvent {
  type: string;
  at: string;
  payload: unknown;
}

type Handler = (e: BusEvent) => void;
const handlers = new Set<Handler>();
let source: EventSource | null = null;

function ensureSource(): void {
  if (source) return;
  source = new EventSource(`${BASE}/api/events`);
  const forward = (ev: MessageEvent) => {
    try {
      const e = JSON.parse(ev.data as string) as BusEvent;
      for (const h of handlers) h(e);
    } catch {
      /* ignore */
    }
  };
  for (const type of ["job", "traces", "replay", "coverage", "grading", "grade", "golden", "eval", "gate", "warning", "seeded"]) source.addEventListener(type, forward as EventListener);
  source.onerror = () => {
    source?.close();
    source = null;
    setTimeout(ensureSource, 1500);
  };
}

export function useEvents(handler: Handler, deps: unknown[] = []): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    ensureSource();
    const h: Handler = (e) => ref.current(e);
    handlers.add(h);
    return () => {
      handlers.delete(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useApi<T>(path: string | null, refreshOn: string[] = []): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, tick]);
  const timer = useRef<number | null>(null);
  useEvents(
    (e) => {
      if (refreshOn.includes(e.type) || refreshOn.includes("*")) {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(reload, 120);
      }
    },
    [refreshOn.join(",")],
  );
  return { data, error, loading, reload };
}
