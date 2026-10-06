import { buildApp, createContext } from "./app.js";

const portFlag = process.argv.indexOf("--port");
const port = Number(portFlag >= 0 ? process.argv[portFlag + 1] : process.env.BLINDSPOT_PORT ?? process.env.PORT ?? 4040);
const dbPath = process.env.BLINDSPOT_DB ?? "./data/blindspot.sqlite";

const ctx = createContext(dbPath);
if (!ctx.svc.isSeeded()) {
  const r = ctx.svc.seedDemo({ days: 7 });
  console.log(`seeded demo engagement: ${r.golden} golden cases, ${r.traces} traces ingested, ${r.pending} held for replay`);
}
const resumed = ctx.runner.resumeIncomplete();
if (resumed) console.log(`resumed ${resumed} interrupted job(s) from their last checkpoint`);

const app = await buildApp(ctx);
await app.listen({ port, host: "0.0.0.0" });
console.log(`Blindspot API on http://localhost:${port}  (embedder: ${ctx.svc.embedder.name}, judge: ${ctx.svc.judge.name})`);
