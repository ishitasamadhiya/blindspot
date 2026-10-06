import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { AzureOpenAIEmbedder, AzureOpenAIJudge, azureConfigFromEnv } from "./azure.js";
import { openDb, type Db } from "./db.js";
import { EventBus } from "./events.js";
import { JobRunner } from "./jobs.js";
import { registerRoutes } from "./routes.js";
import { Services } from "./services.js";

export interface AppContext {
  db: Db;
  bus: EventBus;
  runner: JobRunner;
  svc: Services;
}

export function createContext(dbPath: string, env: NodeJS.ProcessEnv = process.env): AppContext {
  const db = openDb(dbPath);
  const bus = new EventBus();
  const runner = new JobRunner(db, bus);
  const azure = azureConfigFromEnv(env);
  const warn = (reason: string) => bus.emit("warning", { reason });
  const svc = new Services(db, bus, runner, azure ? { embedder: new AzureOpenAIEmbedder(azure, warn), judge: new AzureOpenAIJudge(azure, warn) } : {});
  return { db, bus, runner, svc };
}

export async function buildApp(ctx: AppContext, opts: { serveWeb?: boolean } = {}) {
  const app = Fastify({ logger: false, bodyLimit: 50 * 1024 * 1024 });
  await app.register(cors, { origin: true });
  registerRoutes(app, ctx.svc, ctx.runner, ctx.bus);
  if (opts.serveWeb !== false) {
    const here = dirname(fileURLToPath(import.meta.url));
    const dist = resolve(here, "../../web/dist");
    if (existsSync(dist)) {
      await app.register(fastifyStatic, { root: dist, prefix: "/" });
      app.setNotFoundHandler((req, reply) => {
        if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
        return reply.sendFile("index.html");
      });
    }
  }
  return app;
}
