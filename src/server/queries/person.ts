import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { mandates, personExternalIds, persons, personStatusEvents } from "../db/schema";
import { partyTimeline } from "@/domain/party-timeline";
import { groupSiglas } from "./search";
import { syncDeputadoDetail } from "../connectors/camara/jobs";
import { withTimeout } from "@/lib/async";

import { roleOf, type AuthorRole } from "@/domain/authorship";
export type { AuthorRole };

export type PersonProposition = {
  id: string;
  externalId: string;
  siglaTipo: string;
  numero: number;
  ano: number;
  ementa: string;
  presentedAt: Date | null;
  statusSituacao: string | null;
  statusTramitacao: string | null;
  statusOrgao: string | null;
  role: AuthorRole;
  signatureOrder: number | null;
};

export async function getPerson(personId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(personId)) return null;
  const person = await db.query.persons.findFirst({ where: eq(persons.id, personId) });
  if (!person) return null;
  const [ids, mands, events] = await Promise.all([
    db.select().from(personExternalIds).where(eq(personExternalIds.personId, personId)),
    db.select().from(mandates).where(eq(mandates.personId, personId)).orderBy(desc(mandates.legislature)),
    db.select().from(personStatusEvents).where(eq(personStatusEvents.personId, personId)).orderBy(asc(personStatusEvents.at)),
  ]);
  return {
    person,
    camaraId: ids.find((i) => i.system === "camara")?.externalId ?? null,
    externalIds: ids,
    mandates: mands,
    statusEvents: events,
    parties: partyTimeline(events),
  };
}

/**
 * Atualiza o detalhe do deputado se estiver velho, com limite de tempo.
 * Em falha, devolve o motivo para a interface avisar que os dados podem estar desatualizados.
 */
export async function refreshPersonIfStale(personId: string, camaraId: string | null, syncedAt: Date | null, maxAgeH = 24): Promise<{ refreshed: boolean; error: string | null }> {
  if (!camaraId) return { refreshed: false, error: null };
  if (syncedAt && Date.now() - syncedAt.getTime() < maxAgeH * 3600_000) return { refreshed: false, error: null };
  try {
    await withTimeout(syncDeputadoDetail(camaraId), 8000);
    return { refreshed: true, error: null };
  } catch (err) {
    return { refreshed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type PersonPropositionFilter = {
  role?: AuthorRole | "todas";
  group?: "norma" | "requerimento" | "emenda_parecer" | "todos";
  codTemas?: number[];
  ano?: number;
  /** Só proposições cuja situação registra transformação em norma jurídica. */
  onlyLaw?: boolean;
  limit?: number;
  offset?: number;
};

function roleSql(role: AuthorRole) {
  if (role === "autoria") return sql`pa.proponent is true and pa.signature_order = 1`;
  if (role === "coautoria") return sql`pa.proponent is true and pa.signature_order > 1`;
  if (role === "apoio") return sql`pa.proponent is false`;
  return sql`(pa.proponent is null or (pa.proponent is true and pa.signature_order is null))`;
}

function filterSql(f: PersonPropositionFilter) {
  const parts = [
    f.role && f.role !== "todas" ? roleSql(f.role) : sql`true`,
    f.group && f.group !== "todos" ? sql`p.sigla_tipo in ${groupSiglas(f.group)}` : sql`true`,
    f.codTemas?.length ? sql`exists (select 1 from proposition_themes t where t.proposition_id = p.id and t.cod_tema in ${f.codTemas})` : sql`true`,
    f.ano ? sql`p.ano = ${f.ano}` : sql`true`,
    f.onlyLaw ? sql`(p.status_situacao ilike '%norma jur%' or p.status_situacao ilike 'transformad%')` : sql`true`,
  ];
  return sql.join(parts, sql` and `);
}

export async function personPropositions(personId: string, f: PersonPropositionFilter = {}): Promise<{ items: PersonProposition[]; total: number }> {
  const where = filterSql(f);
  const [rows, count] = await Promise.all([
    db.execute<{
      id: string; external_id: string; sigla_tipo: string; numero: number; ano: number; ementa: string;
      presented_at: string | null; status_situacao: string | null; status_tramitacao: string | null; status_orgao: string | null; proponent: boolean | null; signature_order: number | null;
    }>(sql`
      select p.id, p.external_id, p.sigla_tipo, p.numero, p.ano, p.ementa, p.presented_at, p.status_situacao, p.status_tramitacao, p.status_orgao, pa.proponent, pa.signature_order
      from proposition_authors pa join propositions p on p.id = pa.proposition_id
      where pa.person_id = ${personId} and ${where}
      order by p.presented_at desc nulls last, p.numero desc
      limit ${f.limit ?? 30} offset ${f.offset ?? 0}`),
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from proposition_authors pa join propositions p on p.id = pa.proposition_id
      where pa.person_id = ${personId} and ${where}`),
  ]);
  return {
    total: Number(count[0]?.n ?? 0),
    items: rows.map((r) => ({
      id: r.id,
      externalId: r.external_id,
      siglaTipo: r.sigla_tipo,
      numero: Number(r.numero),
      ano: Number(r.ano),
      ementa: r.ementa,
      presentedAt: r.presented_at ? new Date(r.presented_at) : null,
      statusSituacao: r.status_situacao,
      statusTramitacao: r.status_tramitacao,
      statusOrgao: r.status_orgao,
      role: roleOf(r.proponent, r.signature_order),
      signatureOrder: r.signature_order,
    })),
  };
}

/** Contagens por papel e tipo, com o período efetivamente coberto pelos dados locais. */
export async function personPropositionStats(personId: string) {
  const rows = await db.execute<{ role: string; grp: string; n: number; min_year: number | null; max_year: number | null }>(sql`
    select
      case when pa.proponent is false then 'apoio'
           when pa.proponent is true and pa.signature_order = 1 then 'autoria'
           when pa.proponent is true and pa.signature_order > 1 then 'coautoria'
           else 'nao_verificado' end as role,
      case when p.sigla_tipo in ${groupSiglas("norma")} then 'norma'
           when p.sigla_tipo in ${groupSiglas("requerimento")} then 'requerimento'
           when p.sigla_tipo in ${groupSiglas("emenda_parecer")} then 'emenda_parecer' else 'outro' end as grp,
      count(*)::int as n, min(p.ano)::int as min_year, max(p.ano)::int as max_year
    from proposition_authors pa join propositions p on p.id = pa.proposition_id
    where pa.person_id = ${personId}
    group by 1, 2`);
  return rows.map((r) => ({ role: r.role as AuthorRole, group: r.grp, count: Number(r.n), minYear: r.min_year, maxYear: r.max_year }));
}

/** Proposições em que a pessoa consta como ÚLTIMO relator registrado (não é a lista completa de relatorias). */
export async function personRapporteurships(camaraId: string, limit = 20) {
  const rows = await db.execute<{ id: string; sigla_tipo: string; numero: number; ano: number; ementa: string; status_orgao: string | null; status_at: string | null; status_situacao: string | null }>(sql`
    select p.id, p.sigla_tipo, p.numero, p.ano, p.ementa, p.status_orgao, p.status_at, p.status_situacao
    from propositions p where p.last_rapporteur_external_id = ${camaraId}
    order by p.status_at desc nulls last limit ${limit}`);
  const total = await db.execute<{ n: number }>(sql`select count(*)::int as n from propositions where last_rapporteur_external_id = ${camaraId}`);
  return { total: Number(total[0]?.n ?? 0), items: rows.map((r) => ({ ...r, numero: Number(r.numero), ano: Number(r.ano), statusAt: r.status_at ? new Date(r.status_at) : null })) };
}

/**
 * Notícias que mencionam o nome parlamentar completo. É correspondência textual:
 * pode incluir homônimos e não atribui nenhum registro à pessoa.
 */
export async function personNewsMentions(name: string, limit = 10) {
  if (name.trim().split(/\s+/).length < 2) return [];
  const rows = await db.execute<{ id: string; title: string; published_at: string; topic_slug: string | null; source_id: string }>(sql`
    select n.id, n.title, n.published_at, n.topic_slug, n.source_id from news_articles n
    where immutable_unaccent(lower(n.title || ' ' || n.lead)) like '%' || immutable_unaccent(lower(${name})) || '%'
    order by n.published_at desc limit ${limit}`);
  return rows.map((r) => ({ ...r, publishedAt: new Date(r.published_at) }));
}

export async function personsByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(persons).where(and(sql`${persons.id} in ${ids}`));
}
