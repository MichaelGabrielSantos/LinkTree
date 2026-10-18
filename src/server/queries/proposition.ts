import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { propositionAuthors, propositions, propositionTexts, propositionThemes, propositionVersions, tramitacoes } from "../db/schema";
import { currentStage, STAGE_INFO } from "@/domain/legislative-stage";
import { syncPropositionDetail } from "../connectors/camara/jobs";
import { withTimeout } from "@/lib/async";

export async function getProposition(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const prop = await db.query.propositions.findFirst({ where: eq(propositions.id, id) });
  if (!prop) return null;
  const [authors, themes, trams, versions, text, main, attached] = await Promise.all([
    db
      .select()
      .from(propositionAuthors)
      .where(eq(propositionAuthors.propositionId, id))
      .orderBy(sql`${propositionAuthors.proponent} desc nulls last`, asc(propositionAuthors.signatureOrder)),
    db.select().from(propositionThemes).where(eq(propositionThemes.propositionId, id)).orderBy(asc(propositionThemes.relevancia)),
    db.select().from(tramitacoes).where(eq(tramitacoes.propositionId, id)).orderBy(desc(tramitacoes.sequence)),
    db
      .select({ version: propositionVersions.version, collectedAt: propositionVersions.collectedAt, contentHash: propositionVersions.contentHash })
      .from(propositionVersions)
      .where(eq(propositionVersions.propositionId, id))
      .orderBy(desc(propositionVersions.version)),
    db.query.propositionTexts.findFirst({ where: eq(propositionTexts.propositionId, id), orderBy: desc(propositionTexts.extractedAt) }),
    prop.mainPropositionExternalId
      ? db.query.propositions.findFirst({ where: and(eq(propositions.sourceId, prop.sourceId), eq(propositions.externalId, prop.mainPropositionExternalId)) })
      : Promise.resolve(undefined),
    db
      .select({ id: propositions.id, siglaTipo: propositions.siglaTipo, numero: propositions.numero, ano: propositions.ano, ementa: propositions.ementa })
      .from(propositions)
      .where(and(eq(propositions.sourceId, prop.sourceId), eq(propositions.mainPropositionExternalId, prop.externalId)))
      .limit(50),
  ]);
  const last = trams[0] ?? null;
  const stage = currentStage(prop.statusSituacao, last ? { codTipoTramitacao: last.codTipoTramitacao, descricaoTramitacao: last.descricaoTramitacao, siglaOrgao: last.orgao } : prop.statusTramitacao ? { descricaoTramitacao: prop.statusTramitacao, siglaOrgao: prop.statusOrgao } : null);
  return { prop, authors, themes, tramitacoes: trams, versions, text: text ?? null, main: main ?? null, attached, stage, stageInfo: STAGE_INFO[stage] };
}

export type PropositionView = NonNullable<Awaited<ReturnType<typeof getProposition>>>;

export async function refreshPropositionIfStale(prop: { externalId: string; sourceId: string; detailSyncedAt: Date | null }, maxAgeH = 12) {
  if (prop.sourceId !== "camara") return { refreshed: false, error: null as string | null };
  if (prop.detailSyncedAt && Date.now() - prop.detailSyncedAt.getTime() < maxAgeH * 3600_000) return { refreshed: false, error: null };
  try {
    await withTimeout(syncPropositionDetail(prop.externalId), 10_000);
    return { refreshed: true, error: null };
  } catch (err) {
    return { refreshed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function findPropositionByExternal(sourceId: string, externalId: string) {
  return db.query.propositions.findFirst({ where: and(eq(propositions.sourceId, sourceId), eq(propositions.externalId, externalId)) });
}
