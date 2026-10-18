import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { aiUsage, rateLimits } from "../db/schema";
import { PRICE_PER_MTOK } from "./provider";

/** Incrementa e verifica um contador por janela fixa. Retorna false se o limite foi atingido. */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (limit <= 0) return false;
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const rows = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  return (rows[0]?.count ?? 1) <= limit;
}

export async function dailyModelCalls(): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`select count(*)::int as n from ai_usage where at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' and outcome <> 'nao_configurado'`);
  return Number(rows[0]?.n ?? 0);
}

export async function canCallModel(): Promise<boolean> {
  const limit = Number(process.env.AI_DAILY_CALL_LIMIT ?? 500);
  return (await dailyModelCalls()) < limit;
}

export async function recordUsage(route: string, model: string, inputTokens: number, outputTokens: number, outcome: string) {
  const price = PRICE_PER_MTOK[model] ?? { in: 0, out: 0 };
  await db.insert(aiUsage).values({
    route,
    model,
    inputTokens,
    outputTokens,
    estimatedCostUsd: (inputTokens * price.in + outputTokens * price.out) / 1_000_000,
    outcome,
  });
}
