import type { FastifyReply } from "fastify";

export interface BusEvent {
  type: string;
  at: string;
  payload: unknown;
}

type Listener = (e: BusEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();
  private recent: BusEvent[] = [];

  emit(type: string, payload: unknown): void {
    const e: BusEvent = { type, at: new Date().toISOString(), payload };
    this.recent.push(e);
    if (this.recent.length > 200) this.recent.shift();
    for (const l of this.listeners) l(e);
  }

  subscribe(reply: FastifyReply): () => void {
    const listener: Listener = (e) => {
      reply.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    };
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  history(): BusEvent[] {
    return this.recent.slice();
  }
}
