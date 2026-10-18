import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export type GenerateArgs<T extends z.ZodTypeAny> = {
  system: string;
  user: string;
  schema: T;
  maxTokens?: number;
  route: string;
};

export type GenerateResult<T> =
  | { ok: true; data: T; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; reason: "nao_configurado" | "recusa" | "formato_invalido" | "erro_provedor" | "limite"; detail?: string; model: string; inputTokens: number; outputTokens: number };

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  readonly configured: boolean;
  generate<T extends z.ZodTypeAny>(args: GenerateArgs<T>): Promise<GenerateResult<z.infer<T>>>;
}

/** Sem provedor: o produto opera em modo somente-evidências e diz isso à pessoa. */
export class NoneProvider implements LlmProvider {
  readonly name = "none";
  readonly model = "nenhum";
  readonly configured = false;
  async generate<T extends z.ZodTypeAny>(): Promise<GenerateResult<z.infer<T>>> {
    return { ok: false, reason: "nao_configurado", model: this.model, inputTokens: 0, outputTokens: 0 };
  }
}

/**
 * Anthropic Messages API com saída estruturada (JSON validado por Zod).
 * A chave vive só no servidor (ANTHROPIC_API_KEY); o modelo não recebe ferramentas nem segredos.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  readonly configured = true;
  private client: Anthropic;
  constructor(readonly model: string, apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  async generate<T extends z.ZodTypeAny>(args: GenerateArgs<T>): Promise<GenerateResult<z.infer<T>>> {
    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: args.maxTokens ?? 8000,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
        output_config: { effort: "medium", format: betaZodOutputFormat(args.schema) },
        // Em recusa por política, a API tenta o modelo substituto recomendado.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      const usage = { model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
      if (response.stop_reason === "refusal") return { ok: false, reason: "recusa", detail: response.stop_details?.category ?? undefined, ...usage };
      if (response.stop_reason === "max_tokens" || response.parsed_output == null) return { ok: false, reason: "formato_invalido", ...usage };
      return { ok: true, data: response.parsed_output as z.infer<T>, ...usage };
    } catch (err) {
      const detail = err instanceof Anthropic.APIError ? `${err.status ?? ""} ${err.name}` : err instanceof Error ? err.name : "desconhecido";
      const reason = err instanceof Anthropic.RateLimitError ? "limite" : "erro_provedor";
      return { ok: false, reason, detail, model: this.model, inputTokens: 0, outputTokens: 0 };
    }
  }
}

let override: LlmProvider | null = null;
/** Usado por testes e avaliações para injetar um provedor determinístico identificado. */
export function setProviderOverride(p: LlmProvider | null) {
  override = p;
}

export function getProvider(): LlmProvider {
  if (override) return override;
  const kind = process.env.AI_PROVIDER ?? "none";
  if (kind === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider(process.env.AI_MODEL || "claude-opus-5-5", process.env.ANTHROPIC_API_KEY);
  }
  return new NoneProvider();
}

/** Preço público por milhão de tokens (US$), usado só para estimativa de custo no painel. */
export const PRICE_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
};
