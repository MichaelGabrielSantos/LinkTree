import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { ingestionRuns, jobCheckpoints } from "../db/schema";

export type RunCounters = {
  seen: number;
  created: number;
  updated: number;
  unchanged: number;
  requests: number;
  errors: string[];
};

export type RunContext = RunCounters & { runId: number; countRequest: () => void };

/**
 * Executa um job registrando a execução. Falhas não apagam dados: cada job faz upserts
 * incrementais, então o que já foi gravado permanece e a execução fica marcada como falha/parcial.
 */
export async function withRun<T>(
  sourceId: string,
  job: string,
  params: Record<string, unknown>,
  fn: (ctx: RunContext) => Promise<T>,
): Promise<{ result: T | null; status: "success" | "partial" | "failed"; runId: number; counters: RunCounters }> {
  const [run] = await db.insert(ingestionRuns).values({ sourceId, job, params, status: "running" }).returning({ id: ingestionRuns.id });
  const ctx: RunContext = {
    runId: run.id,
    seen: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    requests: 0,
    errors: [],
    countRequest() {
      ctx.requests++;
    },
  };
  let result: T | null = null;
  let status: "success" | "partial" | "failed" = "success";
  let fatal: string | null = null;
  try {
    result = await fn(ctx);
    if (ctx.errors.length) status = "partial";
  } catch (err) {
    status = "failed";
    fatal = err instanceof Error ? err.message : String(err);
  }
  const errorText = [fatal, ...ctx.errors.slice(0, 20)].filter(Boolean).join("\n") || null;
  await db
    .update(ingestionRuns)
    .set({
      status,
      finishedAt: sql`now()`,
      itemsSeen: ctx.seen,
      itemsCreated: ctx.created,
      itemsUpdated: ctx.updated,
      itemsUnchanged: ctx.unchanged,
      requests: ctx.requests,
      error: errorText,
    })
    .where(eq(ingestionRuns.id, run.id));
  return { result, status, runId: run.id, counters: ctx };
}

export async function getCheckpoint<T extends Record<string, unknown>>(key: string): Promise<T | null> {
  const row = await db.query.jobCheckpoints.findFirst({ where: eq(jobCheckpoints.key, key) });
  return (row?.value as T) ?? null;
}

export async function setCheckpoint(key: string, value: Record<string, unknown>) {
  await db
    .insert(jobCheckpoints)
    .values({ key, value })
    .onConflictDoUpdate({ target: jobCheckpoints.key, set: { value, updatedAt: sql`now()` } });
}
