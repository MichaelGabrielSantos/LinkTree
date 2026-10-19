import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  mandates,
  personExternalIds,
  persons,
  personStatusEvents,
  propositionAuthors,
  propositions,
  propositionThemes,
  propositionVersions,
  tramitacoes,
} from "../../db/schema";
import { stableHash } from "@/lib/hash";
import { classifyTramitacao, NORM_PROPOSAL_TYPES } from "@/domain/legislative-stage";
import { getCheckpoint, setCheckpoint, withRun, type RunContext } from "../../ingestion/runs";
import {
  AutorItem,
  BulkAutor,
  BulkProposicao,
  BulkTema,
  camaraBulkDownload,
  camaraGet,
  camaraIdFromUri,
  camaraPaginate,
  DeputadoDetail,
  DeputadoListItem,
  HistoricoItem,
  ProposicaoDetail,
  ProposicaoListItem,
  TemaItem,
  TramitacaoItem,
} from "./api";
import { z } from "zod";

const SOURCE = "camara";

/** Datas oficiais das legislaturas (GET /legislaturas, consultado em 2026-10-18). */
export const LEGISLATURES: Record<number, { start: string; end: string }> = {
  55: { start: "2015-02-01", end: "2019-01-31" },
  56: { start: "2019-02-01", end: "2023-01-31" },
  57: { start: "2023-02-01", end: "2027-01-31" },
};
export const CURRENT_LEGISLATURE = 57;

const toDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  // A Câmara publica horários locais sem fuso ("2026-09-30T10:49"). Interpretamos como America/Sao_Paulo (UTC-3, sem horário de verão desde 2019).
  const hasZone = /[zZ]|[+-]\d\d:?\d\d$/.test(s);
  const iso = s.length === 10 ? `${s}T00:00:00-03:00` : hasZone ? s : `${s}-03:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ───────────────────────── Pessoas ─────────────────────────

/** Vincula sempre pelo ID oficial da Câmara. Nunca por nome. */
export async function upsertPersonByCamaraId(
  externalId: string,
  fields: { name: string; photoUrl?: string | null },
  opts: { overwriteName: boolean },
): Promise<{ personId: string; created: boolean }> {
  const existing = await db.query.personExternalIds.findFirst({
    where: and(eq(personExternalIds.system, "camara"), eq(personExternalIds.externalId, externalId)),
  });
  if (existing) {
    if (opts.overwriteName || fields.photoUrl) {
      await db
        .update(persons)
        .set({
          ...(opts.overwriteName ? { name: fields.name } : {}),
          ...(fields.photoUrl ? { photoUrl: fields.photoUrl, photoSource: "Câmara dos Deputados" } : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(persons.id, existing.personId));
    }
    return { personId: existing.personId, created: false };
  }
  return db.transaction(async (tx) => {
    const [p] = await tx
      .insert(persons)
      .values({ name: fields.name, photoUrl: fields.photoUrl ?? null, photoSource: fields.photoUrl ? "Câmara dos Deputados" : null })
      .returning({ id: persons.id });
    const inserted = await tx
      .insert(personExternalIds)
      .values({ personId: p.id, system: "camara", externalId, method: "id_oficial" })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      // Corrida com outra execução: descarta a pessoa recém-criada e usa a existente.
      await tx.delete(persons).where(eq(persons.id, p.id));
      const other = await tx.query.personExternalIds.findFirst({
        where: and(eq(personExternalIds.system, "camara"), eq(personExternalIds.externalId, externalId)),
      });
      return { personId: other!.personId, created: false };
    }
    return { personId: p.id, created: true };
  });
}

export async function syncDeputados(legislatures: number[] = [CURRENT_LEGISLATURE, 56]) {
  return withRun(SOURCE, "camara:deputados", { legislatures }, async (ctx) => {
    for (const leg of legislatures) {
      const dates = LEGISLATURES[leg];
      for await (const page of camaraPaginate(
        "/deputados",
        { idLegislatura: leg, itens: 100, ordem: "ASC", ordenarPor: "nome" },
        DeputadoListItem,
        { onRequest: ctx.countRequest, onInvalid: (e) => ctx.errors.push(e) },
      )) {
        for (const d of page) {
          ctx.seen++;
          const { personId, created } = await upsertPersonByCamaraId(
            String(d.id),
            { name: d.nome, photoUrl: d.urlFoto },
            { overwriteName: leg === CURRENT_LEGISLATURE },
          );
          if (created) ctx.created++;
          else ctx.unchanged++;
          await db
            .insert(mandates)
            .values({
              personId,
              office: "deputado_federal",
              uf: d.siglaUf ?? "",
              legislature: leg,
              startDate: dates?.start ?? null,
              endDate: dates?.end ?? null,
              sourceId: SOURCE,
            })
            .onConflictDoUpdate({ target: [mandates.personId, mandates.office, mandates.legislature], set: { uf: d.siglaUf ?? "" } });
          if (leg === CURRENT_LEGISLATURE) {
            // Partido da lista = situação atual informada pela Câmara. Só preenche se ainda não houver dado datado do detalhe.
            await db
              .update(persons)
              .set({ lastKnownParty: d.siglaPartido, lastKnownUf: d.siglaUf })
              .where(and(eq(persons.id, personId), sql`${persons.lastKnownStatusAt} is null`));
          }
        }
      }
    }
  });
}

export async function syncDeputadoDetail(externalId: string, ctx?: RunContext) {
  const run = async (c: RunContext) => {
    const detail = await camaraGet(`/deputados/${externalId}`, {}, DeputadoDetail, c.countRequest);
    const st = detail.ultimoStatus;
    const { personId } = await upsertPersonByCamaraId(externalId, { name: st.nome, photoUrl: st.urlFoto }, { overwriteName: true });
    await db
      .update(persons)
      .set({
        civilName: detail.nomeCivil,
        lastKnownParty: st.siglaPartido,
        lastKnownUf: st.siglaUf,
        lastKnownStatusAt: toDate(st.data),
        lastKnownSituation: [st.situacao, st.condicaoEleitoral].filter(Boolean).join(" · ") || null,
        detailSyncedAt: sql`now()`,
      })
      .where(eq(persons.id, personId));
    const history = await camaraGet(`/deputados/${externalId}/historico`, {}, z.array(HistoricoItem), c.countRequest);
    for (const h of history) {
      const at = toDate(h.dataHora);
      if (!at) continue;
      c.seen++;
      const res = await db
        .insert(personStatusEvents)
        .values({
          personId,
          sourceId: SOURCE,
          at,
          legislature: h.idLegislatura ?? null,
          party: h.siglaPartido,
          uf: h.siglaUf,
          situation: h.situacao,
          condition: h.condicaoEleitoral,
          description: h.descricaoStatus,
        })
        .onConflictDoNothing()
        .returning({ id: personStatusEvents.id });
      if (res.length) c.created++;
      else c.unchanged++;
    }
    return personId;
  };
  if (ctx) return run(ctx);
  const out = await withRun(SOURCE, "camara:deputado-detalhe", { externalId }, run);
  if (out.status === "failed") throw new Error(`Falha ao sincronizar deputado ${externalId}`);
  return out.result!;
}

// ───────────────────────── Proposições ─────────────────────────

type NormalizedProposition = Omit<typeof propositions.$inferInsert, "id" | "contentHash" | "version" | "collectedAt" | "updatedAt">;

function normalizeBulk(p: z.infer<typeof BulkProposicao>): NormalizedProposition {
  const st = p.ultimoStatus;
  return {
    sourceId: SOURCE,
    externalId: String(p.id),
    siglaTipo: p.siglaTipo.trim(),
    numero: p.numero,
    ano: p.ano,
    descricaoTipo: p.descricaoTipo,
    ementa: p.ementa.trim(),
    ementaDetalhada: p.ementaDetalhada || null,
    keywords: p.keywords || null,
    presentedAt: toDate(p.dataApresentacao),
    urlInteiroTeor: p.urlInteiroTeor || null,
    statusAt: toDate(st?.data),
    statusSituacao: st?.descricaoSituacao || null,
    statusCodSituacao: st?.idSituacao || null,
    statusTramitacao: st?.descricaoTramitacao || null,
    statusOrgao: st?.siglaOrgao || null,
    statusDespacho: st?.despacho || null,
    regime: st?.regime || null,
    apreciacao: st?.apreciacao || null,
    lastRapporteurExternalId: camaraIdFromUri(st?.uriRelator),
    mainPropositionExternalId: camaraIdFromUri(p.uriPropPrincipal),
  };
}

function normalizeDetail(p: z.infer<typeof ProposicaoDetail>): NormalizedProposition {
  const st = p.statusProposicao;
  return {
    sourceId: SOURCE,
    externalId: String(p.id),
    siglaTipo: p.siglaTipo.trim(),
    numero: p.numero,
    ano: p.ano,
    descricaoTipo: p.descricaoTipo,
    ementa: p.ementa.trim(),
    ementaDetalhada: p.ementaDetalhada || null,
    keywords: p.keywords || null,
    presentedAt: toDate(p.dataApresentacao),
    urlInteiroTeor: p.urlInteiroTeor || null,
    statusAt: toDate(st?.dataHora),
    statusSituacao: st?.descricaoSituacao || null,
    statusCodSituacao: st?.codSituacao || null,
    statusTramitacao: st?.descricaoTramitacao || null,
    statusOrgao: st?.siglaOrgao || null,
    statusDespacho: st?.despacho || null,
    regime: st?.regime || null,
    apreciacao: st?.apreciacao || null,
    lastRapporteurExternalId: camaraIdFromUri(st?.uriUltimoRelator),
    mainPropositionExternalId: camaraIdFromUri(p.uriPropPrincipal),
  };
}

/** Campos que definem a "versão" de uma proposição. Datas viram ISO para hash estável. */
function versionHash(n: NormalizedProposition): string {
  return stableHash({
    ...n,
    presentedAt: n.presentedAt instanceof Date ? n.presentedAt.toISOString() : null,
    statusAt: n.statusAt instanceof Date ? n.statusAt.toISOString() : null,
  });
}

/**
 * Upsert idempotente com versionamento: hash igual → nada muda; hash diferente → nova versão
 * preservando o snapshot anterior em proposition_versions.
 */
export async function upsertPropositions(items: NormalizedProposition[], ctx: RunContext): Promise<Map<string, string>> {
  const idByExternal = new Map<string, string>();
  for (let i = 0; i < items.length; i += 500) {
    const chunk = items.slice(i, i + 500);
    const existing = await db
      .select({ id: propositions.id, externalId: propositions.externalId, contentHash: propositions.contentHash, version: propositions.version })
      .from(propositions)
      .where(and(eq(propositions.sourceId, SOURCE), inArray(propositions.externalId, chunk.map((c) => c.externalId))));
    const byExt = new Map(existing.map((e) => [e.externalId, e]));
    const toInsert: Array<typeof propositions.$inferInsert> = [];
    for (const n of chunk) {
      ctx.seen++;
      const hash = versionHash(n);
      const prev = byExt.get(n.externalId);
      if (!prev) {
        toInsert.push({ ...n, contentHash: hash, version: 1 });
        continue;
      }
      idByExternal.set(n.externalId, prev.id);
      if (prev.contentHash === hash) {
        ctx.unchanged++;
        continue;
      }
      const version = prev.version + 1;
      await db.transaction(async (tx) => {
        await tx.update(propositions).set({ ...n, contentHash: hash, version, updatedAt: sql`now()` }).where(eq(propositions.id, prev.id));
        await tx
          .insert(propositionVersions)
          .values({ propositionId: prev.id, version, contentHash: hash, snapshot: JSON.parse(JSON.stringify(n)) })
          .onConflictDoNothing();
      });
      ctx.updated++;
    }
    if (toInsert.length) {
      const inserted = await db
        .insert(propositions)
        .values(toInsert)
        .onConflictDoNothing()
        .returning({ id: propositions.id, externalId: propositions.externalId, contentHash: propositions.contentHash });
      for (const r of inserted) idByExternal.set(r.externalId, r.id);
      ctx.created += inserted.length;
      if (inserted.length) {
        const byExtInsert = new Map(toInsert.map((t) => [t.externalId, t]));
        await db
          .insert(propositionVersions)
          .values(
            inserted.map((r) => ({
              propositionId: r.id,
              version: 1,
              contentHash: r.contentHash,
              snapshot: JSON.parse(JSON.stringify(byExtInsert.get(r.externalId))),
            })),
          )
          .onConflictDoNothing();
      }
      // Conflitos (inserção concorrente) → buscar IDs.
      const missing = toInsert.filter((t) => !idByExternal.has(t.externalId)).map((t) => t.externalId);
      if (missing.length) {
        const rows = await db
          .select({ id: propositions.id, externalId: propositions.externalId })
          .from(propositions)
          .where(and(eq(propositions.sourceId, SOURCE), inArray(propositions.externalId, missing)));
        for (const r of rows) idByExternal.set(r.externalId, r.id);
      }
    }
  }
  return idByExternal;
}

async function personIdsForCamaraIds(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const rows = await db
      .select({ externalId: personExternalIds.externalId, personId: personExternalIds.personId })
      .from(personExternalIds)
      .where(and(eq(personExternalIds.system, "camara"), inArray(personExternalIds.externalId, ids.slice(i, i + 1000))));
    for (const r of rows) out.set(r.externalId, r.personId);
  }
  return out;
}

function authorKey(depId: string | null, codTipo: number | null | undefined, name: string) {
  return depId ? `dep:${depId}` : `${codTipo ?? "?"}:${name.trim().toLowerCase()}`;
}

/**
 * Arquivos anuais: proposições, autores (com `proponente` e `ordemAssinatura`) e temas.
 * Usa If-Modified-Since com checkpoint por arquivo — reexecutar sem mudança não toca no banco.
 */
/**
 * `onlyNorma`: guarda só tipos que podem virar norma (PL, PLP, PEC, PDL…), ~12% do volume.
 * Útil para bancos pequenos; requerimentos e emendas ficam fora das contagens.
 */
export async function syncPropositionsBulk(year: number, opts: { force?: boolean; onlyNorma?: boolean } = {}) {
  return withRun(SOURCE, "camara:proposicoes-anual", { year, force: !!opts.force, onlyNorma: !!opts.onlyNorma }, async (ctx) => {
    const ckKey = `camara:bulk:${year}`;
    const ck = (await getCheckpoint<Record<string, string>>(ckKey)) ?? {};
    const newCk: Record<string, string> = { ...ck };

    const propFile = await camaraBulkDownload(`proposicoes/json/proposicoes-${year}.json`, {
      onRequest: ctx.countRequest,
      ifModifiedSince: opts.force ? null : ck.proposicoes,
    });
    let idByExternal = new Map<string, string>();
    if (propFile) {
      const normalized: NormalizedProposition[] = [];
      for (const raw of propFile.data) {
        const p = BulkProposicao.safeParse(raw);
        if (p.success) {
          if (opts.onlyNorma && !NORM_PROPOSAL_TYPES.has(p.data.siglaTipo.trim())) continue;
          normalized.push(normalizeBulk(p.data));
        }
        else ctx.errors.push(`proposição inválida no arquivo ${year}: ${p.error.issues[0]?.message}`);
      }
      idByExternal = await upsertPropositions(normalized, ctx);
      if (propFile.lastModified) newCk.proposicoes = propFile.lastModified;
    }

    const authorsFile = await camaraBulkDownload(`proposicoesAutores/json/proposicoesAutores-${year}.json`, {
      onRequest: ctx.countRequest,
      ifModifiedSince: opts.force || propFile ? null : ck.autores,
    });
    if (authorsFile) {
      const parsed = authorsFile.data.map((r) => BulkAutor.safeParse(r)).flatMap((r) => (r.success ? [r.data] : []));
      const propExtIds = [...new Set(parsed.map((a) => String(a.idProposicao)))].filter((id) => !idByExternal.has(id));
      for (let i = 0; i < propExtIds.length; i += 1000) {
        const rows = await db
          .select({ id: propositions.id, externalId: propositions.externalId })
          .from(propositions)
          .where(and(eq(propositions.sourceId, SOURCE), inArray(propositions.externalId, propExtIds.slice(i, i + 1000))));
        for (const r of rows) idByExternal.set(r.externalId, r.id);
      }
      const depIds = [...new Set(parsed.flatMap((a) => (a.idDeputadoAutor ? [String(a.idDeputadoAutor)] : [])))];
      let personByDep = await personIdsForCamaraIds(depIds);
      for (const a of parsed) {
        const dep = a.idDeputadoAutor ? String(a.idDeputadoAutor) : null;
        if (dep && !personByDep.has(dep)) {
          const { personId } = await upsertPersonByCamaraId(dep, { name: a.nomeAutor }, { overwriteName: false });
          personByDep.set(dep, personId);
        }
      }
      const rows: Array<typeof propositionAuthors.$inferInsert> = [];
      for (const a of parsed) {
        const propositionId = idByExternal.get(String(a.idProposicao));
        if (!propositionId) continue;
        const dep = a.idDeputadoAutor ? String(a.idDeputadoAutor) : null;
        rows.push({
          propositionId,
          personId: dep ? personByDep.get(dep) ?? null : null,
          authorKey: authorKey(dep, a.codTipoAutor, a.nomeAutor),
          name: a.nomeAutor,
          authorType: a.tipoAutor,
          proponent: a.proponente == null ? null : a.proponente === "1",
          signatureOrder: a.ordemAssinatura ? Number(a.ordemAssinatura) : null,
          partyAtTime: a.siglaPartidoAutor,
          ufAtTime: a.siglaUFAutor,
          origin: "arquivo_anual",
        });
      }
      // Remove duplicatas dentro do arquivo (mesmo autor listado duas vezes).
      const uniq = new Map(rows.map((r) => [`${r.propositionId}|${r.authorKey}`, r]));
      const all = [...uniq.values()];
      for (let i = 0; i < all.length; i += 1000) {
        await db
          .insert(propositionAuthors)
          .values(all.slice(i, i + 1000))
          .onConflictDoUpdate({
            target: [propositionAuthors.propositionId, propositionAuthors.authorKey],
            set: {
              personId: sql`excluded.person_id`,
              proponent: sql`excluded.proponent`,
              signatureOrder: sql`excluded.signature_order`,
              partyAtTime: sql`excluded.party_at_time`,
              ufAtTime: sql`excluded.uf_at_time`,
              origin: sql`excluded.origin`,
            },
          });
      }
      if (authorsFile.lastModified) newCk.autores = authorsFile.lastModified;
    }

    const themesFile = await camaraBulkDownload(`proposicoesTemas/json/proposicoesTemas-${year}.json`, {
      onRequest: ctx.countRequest,
      ifModifiedSince: opts.force || propFile ? null : ck.temas,
    });
    if (themesFile) {
      const rows: Array<typeof propositionThemes.$inferInsert> = [];
      const ext = new Set<string>();
      const parsed = themesFile.data.map((r) => BulkTema.safeParse(r)).flatMap((r) => (r.success ? [r.data] : []));
      for (const t of parsed) {
        const id = camaraIdFromUri(t.uriProposicao);
        if (id && !idByExternal.has(id)) ext.add(id);
      }
      const missing = [...ext];
      for (let i = 0; i < missing.length; i += 1000) {
        const found = await db
          .select({ id: propositions.id, externalId: propositions.externalId })
          .from(propositions)
          .where(and(eq(propositions.sourceId, SOURCE), inArray(propositions.externalId, missing.slice(i, i + 1000))));
        for (const r of found) idByExternal.set(r.externalId, r.id);
      }
      for (const t of parsed) {
        const propositionId = idByExternal.get(camaraIdFromUri(t.uriProposicao) ?? "");
        if (propositionId) rows.push({ propositionId, codTema: t.codTema, tema: t.tema, relevancia: t.relevancia ?? null });
      }
      const uniq = [...new Map(rows.map((r) => [`${r.propositionId}|${r.codTema}`, r])).values()];
      for (let i = 0; i < uniq.length; i += 1000) {
        await db
          .insert(propositionThemes)
          .values(uniq.slice(i, i + 1000))
          .onConflictDoUpdate({
            target: [propositionThemes.propositionId, propositionThemes.codTema],
            set: { tema: sql`excluded.tema`, relevancia: sql`excluded.relevancia` },
          });
      }
      if (themesFile.lastModified) newCk.temas = themesFile.lastModified;
    }
    await setCheckpoint(ckKey, newCk);
  });
}

/** Detalhe + autores + temas + tramitações de uma proposição via API. */
export async function syncPropositionDetail(externalId: string, ctx?: RunContext): Promise<string> {
  const run = async (c: RunContext) => {
    const detail = await camaraGet(`/proposicoes/${externalId}`, {}, ProposicaoDetail, c.countRequest);
    const map = await upsertPropositions([normalizeDetail(detail)], c);
    const propositionId = map.get(String(detail.id));
    if (!propositionId) throw new Error(`Proposição ${externalId} não gravada`);

    const authors = await camaraGet(`/proposicoes/${externalId}/autores`, {}, z.array(AutorItem), c.countRequest);
    const depIds = authors.map((a) => camaraIdFromUri(a.uri)).filter((x): x is string => !!x);
    const personByDep = await personIdsForCamaraIds(depIds);
    for (const a of authors) {
      const dep = camaraIdFromUri(a.uri);
      let personId = dep ? personByDep.get(dep) ?? null : null;
      if (dep && !personId) personId = (await upsertPersonByCamaraId(dep, { name: a.nome }, { overwriteName: false })).personId;
      await db
        .insert(propositionAuthors)
        .values({
          propositionId,
          personId,
          authorKey: authorKey(dep, a.codTipo, a.nome),
          name: a.nome,
          authorType: a.tipo,
          proponent: a.proponente == null ? null : a.proponente === 1,
          signatureOrder: a.ordemAssinatura ?? null,
          origin: "api",
        })
        .onConflictDoUpdate({
          target: [propositionAuthors.propositionId, propositionAuthors.authorKey],
          set: { personId, proponent: a.proponente == null ? null : a.proponente === 1, signatureOrder: a.ordemAssinatura ?? null, name: a.nome },
        });
    }

    const themes = await camaraGet(`/proposicoes/${externalId}/temas`, {}, z.array(TemaItem), c.countRequest);
    for (const t of themes) {
      await db
        .insert(propositionThemes)
        .values({ propositionId, codTema: t.codTema, tema: t.tema, relevancia: t.relevancia ?? null })
        .onConflictDoUpdate({ target: [propositionThemes.propositionId, propositionThemes.codTema], set: { tema: t.tema, relevancia: t.relevancia ?? null } });
    }

    const trams = await camaraGet(`/proposicoes/${externalId}/tramitacoes`, {}, z.array(TramitacaoItem), c.countRequest);
    for (const t of trams) {
      const at = toDate(t.dataHora);
      if (!at) continue;
      const row = {
        propositionId,
        sequence: t.sequencia,
        at,
        orgao: t.siglaOrgao,
        descricaoTramitacao: t.descricaoTramitacao,
        codTipoTramitacao: t.codTipoTramitacao,
        situacao: t.descricaoSituacao,
        codSituacao: t.codSituacao,
        despacho: t.despacho,
        url: t.url,
        regime: t.regime,
        apreciacao: t.apreciacao,
        stage: classifyTramitacao({ codTipoTramitacao: t.codTipoTramitacao, descricaoTramitacao: t.descricaoTramitacao, siglaOrgao: t.siglaOrgao }),
      };
      await db.insert(tramitacoes).values(row).onConflictDoUpdate({ target: [tramitacoes.propositionId, tramitacoes.sequence], set: row });
    }
    await db.update(propositions).set({ detailSyncedAt: sql`now()` }).where(eq(propositions.id, propositionId));
    return propositionId;
  };
  if (ctx) return run(ctx);
  const out = await withRun(SOURCE, "camara:proposicao-detalhe", { externalId }, run);
  if (out.status === "failed" || !out.result) throw new Error(`Falha ao sincronizar proposição ${externalId}`);
  return out.result;
}

/**
 * Proposições de um deputado via API (cobre anos anteriores aos arquivos anuais sincronizados).
 * A listagem não informa se a pessoa é proponente ou apoiadora: o vínculo fica com `proponent = null`
 * e nunca sobrescreve um papel já verificado pelo arquivo anual.
 */
export async function syncDeputadoPropositionsApi(deputadoExternalId: string, opts: { maxPages?: number } = {}) {
  return withRun(SOURCE, "camara:proposicoes-deputado", { deputadoExternalId }, async (ctx) => {
    const personByDep = await personIdsForCamaraIds([deputadoExternalId]);
    let personId = personByDep.get(deputadoExternalId);
    if (!personId) personId = await syncDeputadoDetail(deputadoExternalId, ctx);
    for await (const page of camaraPaginate(
      "/proposicoes",
      { idDeputadoAutor: deputadoExternalId, itens: 100, ordem: "DESC", ordenarPor: "id" },
      ProposicaoListItem,
      { onRequest: ctx.countRequest, maxPages: opts.maxPages ?? 60, onInvalid: (e) => ctx.errors.push(e) },
    )) {
      const extIds = page.map((p) => String(p.id));
      const existing = await db
        .select({ id: propositions.id, externalId: propositions.externalId })
        .from(propositions)
        .where(and(eq(propositions.sourceId, SOURCE), inArray(propositions.externalId, extIds)));
      const known = new Map(existing.map((e) => [e.externalId, e.id]));
      const fresh = page
        .filter((p) => !known.has(String(p.id)))
        .map((p) => ({
          sourceId: SOURCE,
          externalId: String(p.id),
          siglaTipo: p.siglaTipo.trim(),
          numero: p.numero,
          ano: p.ano,
          ementa: p.ementa.trim(),
          presentedAt: toDate(p.dataApresentacao),
        }));
      const ids = await upsertPropositions(fresh, ctx);
      ctx.unchanged += page.length - fresh.length;
      for (const [ext, id] of ids) known.set(ext, id);
      const links = [...known.values()].map((propositionId) => ({
        propositionId,
        personId: personId!,
        authorKey: `dep:${deputadoExternalId}`,
        name: "",
        authorType: "Deputado(a)",
        proponent: null,
        origin: "api" as const,
      }));
      if (links.length) await db.insert(propositionAuthors).values(links).onConflictDoNothing();
    }
    // Preenche nome nos vínculos criados agora.
    await db.execute(sql`
      update proposition_authors pa set name = p.name
      from persons p where pa.person_id = p.id and pa.name = '' and pa.person_id = ${personId}`);
    await db.update(persons).set({ propositionsSyncedAt: sql`now()` }).where(eq(persons.id, personId!));
  });
}
