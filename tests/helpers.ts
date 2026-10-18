import { sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db/client";
import { seedReferenceData } from "@/server/db/seed";
import type { GenerateArgs, GenerateResult, LlmProvider } from "@/server/ai/provider";

export async function resetDb() {
  await db.execute(sql`truncate table
    news_article_versions, news_articles, event_clusters, proposition_versions, proposition_texts, proposition_authors,
    proposition_themes, tramitacoes, propositions, person_status_events, mandates, person_external_ids, persons,
    follows, saved_items, messages, conversations, generated_answers, ai_usage, rate_limits, admin_audit_log,
    coverage_interest, consents, user_preferences, sessions, users, ingestion_runs, job_checkpoints restart identity cascade`);
  await seedReferenceData();
}

/**
 * Provedor determinístico para testes (FIXTURE). Não avalia a qualidade do modelo real:
 * serve para testar o pipeline (validação, cache, abstenção) com saídas controladas.
 */
export class FakeProvider implements LlmProvider {
  readonly name = "fake-test";
  readonly model = "fake-test-model";
  readonly configured = true;
  calls: Array<{ system: string; user: string }> = [];
  constructor(private respond: (args: { system: string; user: string }) => unknown) {}
  async generate<T extends z.ZodTypeAny>(args: GenerateArgs<T>): Promise<GenerateResult<z.infer<T>>> {
    this.calls.push({ system: args.system, user: args.user });
    const parsed = args.schema.safeParse(this.respond(args));
    if (!parsed.success) return { ok: false, reason: "formato_invalido", model: this.model, inputTokens: 1, outputTokens: 1 };
    return { ok: true, data: parsed.data, model: this.model, inputTokens: 100, outputTokens: 50 };
  }
}

export function mockFetchOnce(map: Record<string, () => Response>) {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    for (const [k, fn] of Object.entries(map)) if (url.includes(k)) return fn();
    throw new TypeError(`fetch falhou (mock): ${url}`);
  };
}
