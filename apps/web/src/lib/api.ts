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
let lastEventAt = 0;

function ensureSource(): void {
  if (source) return;
  const es = new EventSource(`${BASE}/api/events`);
  source = es;
  lastEventAt = Date.now();
  const forward = (ev: MessageEvent) => {
    lastEventAt = Date.now();
    try {
      const e = JSON.parse(ev.data as string) as BusEvent;
      if (e.type === "ping" || e.type === "hello") return;
      for (const h of handlers) h(e);
    } catch {
      /* ignore */
    }
  };
  for (const type of ["hello", "ping", "job", "traces", "replay", "coverage", "grading", "grade", "golden", "eval", "gate", "warning", "seeded"]) es.addEventListener(type, forward as EventListener);
  es.onerror = () => {
    if (source === es) {
      es.close();
      source = null;
      setTimeout(ensureSource, 1500);
    }
  };
}

/* A proxied stream can die without an error event; if no ping arrives for 45 s, reconnect. */
setInterval(() => {
  if (source && Date.now() - lastEventAt > 45_000) {
    source.close();
    source = null;
    ensureSource();
  }
}, 10_000);

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
  useEffect(() => {
    if (!path || refreshOn.length === 0) return;
    const id = window.setInterval(reload, 8000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, refreshOn.join(",")]);
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
