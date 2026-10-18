import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { follows, personExternalIds } from "../db/schema";
import { syncAgenciaBrasil } from "../connectors/agencia-brasil/rss";
import {
  syncDeputadoDetail,
  syncDeputadoPropositionsApi,
  syncDeputados,
  syncPropositionDetail,
  syncPropositionsBulk,
} from "../connectors/camara/jobs";

/** Anos cobertos pelos arquivos anuais por padrão: legislaturas 56 e 57. */
export const DEFAULT_BULK_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

export const JOBS = {
  /** Recomendado a cada 30 min. */
  noticias: async () => [await syncAgenciaBrasil()],
  /** Recomendado 1x/dia. */
  deputados: async () => [await syncDeputados()],
  /** Recomendado 1x/dia (If-Modified-Since evita reprocessar arquivos sem mudança). */
  "proposicoes-anuais": async (args: string[]) => {
    const force = args.includes("--force");
    const years = args.filter((a) => /^\d{4}$/.test(a)).map(Number);
    const out = [];
    for (const y of years.length ? years : [new Date().getFullYear()]) out.push(await syncPropositionsBulk(y, { force }));
    return out;
  },
  deputado: async (args: string[]) => {
    const id = args[0];
    if (!/^\d+$/.test(id ?? "")) throw new Error("Uso: deputado <idCamara>");
    await syncDeputadoDetail(id);
    return [await syncDeputadoPropositionsApi(id)];
  },
  proposicao: async (args: string[]) => {
    const id = args[0];
    if (!/^\d+$/.test(id ?? "")) throw new Error("Uso: proposicao <idCamara>");
    return [{ propositionId: await syncPropositionDetail(id) }];
  },
  /** Atualiza deputados seguidos por alguém (detalhe + proposições via API). Recomendado 1x/dia. */
  seguidos: async () => {
    const rows = await db
      .selectDistinct({ externalId: personExternalIds.externalId })
      .from(follows)
      .innerJoin(personExternalIds, sql`${personExternalIds.personId}::text = ${follows.targetId}`)
      .where(eq(follows.targetType, "person"));
    const out = [];
    for (const r of rows) {
      await syncDeputadoDetail(r.externalId);
      out.push(await syncDeputadoPropositionsApi(r.externalId));
    }
    return out;
  },
} as const;

export type JobName = keyof typeof JOBS;
export const isJobName = (s: string): s is JobName => s in JOBS;
