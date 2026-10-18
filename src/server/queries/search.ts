import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { typeGroup } from "@/domain/legislative-stage";
import { contentTokens } from "@/lib/text";

/** Palavras de pergunta que não ajudam a recuperar documentos. */
const RETRIEVAL_STOP = new Set("aconteceu acontece hoje ontem agora qual quais quem como porque por que explique explica significa sobre projeto projetos deputado deputada noticia noticias isso esse essa este esta tem existe existem".split(" "));

/** Consulta OR entre palavras de conteúdo (para perguntas em linguagem natural). */
export function orQuery(q: string): string | null {
  const toks = [...new Set(contentTokens(q).filter((t) => !RETRIEVAL_STOP.has(t) && /^[a-z0-9]+$/.test(t)))].slice(0, 12);
  return toks.length ? toks.join(" | ") : null;
}

export type PersonHit = {
  id: string;
  name: string;
  civilName: string | null;
  photoUrl: string | null;
  lastKnownParty: string | null;
  lastKnownUf: string | null;
  camaraId: string | null;
  mandates: Array<{ office: string; uf: string; legislature: number; startDate: string | null; endDate: string | null }>;
  similarity: number;
};

export type PropositionHit = {
  id: string;
  externalId: string;
  siglaTipo: string;
  numero: number;
  ano: number;
  ementa: string;
  statusSituacao: string | null;
  presentedAt: Date | null;
  rank: number;
};

export type NewsHit = {
  id: string;
  title: string;
  lead: string;
  url: string;
  topicSlug: string | null;
  sourceId: string;
  publishedAt: Date;
  rank: number;
};

const IDENT_RE = /\b(PL|PLP|PEC|PDL|MPV|PLV|PRC|REQ|RIC|INC)\s*n?[ºo°.]?\s*(\d{1,5})\s*(?:\/|de|\s)\s*(\d{4})\b/i;

/** Reconhece identificações oficiais como "PL 5498/2026" ou "pec 45 de 2019". */
export function parsePropositionIdentifier(q: string): { siglaTipo: string; numero: number; ano: number } | null {
  const m = q.match(IDENT_RE);
  if (!m) return null;
  return { siglaTipo: m[1].toUpperCase(), numero: Number(m[2]), ano: Number(m[3]) };
}

export async function searchPersons(q: string, limit = 12): Promise<PersonHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const rows = await db.execute<{
    id: string;
    name: string;
    civil_name: string | null;
    photo_url: string | null;
    last_known_party: string | null;
    last_known_uf: string | null;
    camara_id: string | null;
    mandates: PersonHit["mandates"] | null;
    sim: number;
  }>(sql`
    with q as (select immutable_unaccent(lower(${term})) as t)
    select p.id, p.name, p.civil_name, p.photo_url, p.last_known_party, p.last_known_uf,
      (select external_id from person_external_ids e where e.person_id = p.id and e.system = 'camara' limit 1) as camara_id,
      (select json_agg(json_build_object('office', m.office, 'uf', m.uf, 'legislature', m.legislature, 'startDate', m.start_date, 'endDate', m.end_date) order by m.legislature desc)
         from mandates m where m.person_id = p.id) as mandates,
      greatest(
        similarity(immutable_unaccent(lower(p.name)), q.t),
        word_similarity(q.t, immutable_unaccent(lower(p.name))),
        coalesce(word_similarity(q.t, immutable_unaccent(lower(p.civil_name))), 0) * 0.9
      ) as sim
    from persons p, q
    where immutable_unaccent(lower(p.name)) % q.t
       or q.t <% immutable_unaccent(lower(p.name))
       or (p.civil_name is not null and q.t <% immutable_unaccent(lower(p.civil_name)))
    order by sim desc, exists (select 1 from mandates m where m.person_id = p.id and m.legislature = 57) desc, p.name
    limit ${limit}`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    civilName: r.civil_name,
    photoUrl: r.photo_url,
    lastKnownParty: r.last_known_party,
    lastKnownUf: r.last_known_uf,
    camaraId: r.camara_id,
    mandates: r.mandates ?? [],
    similarity: Number(r.sim),
  })).filter((r) => r.similarity >= 0.3);
}

/**
 * Indica se os resultados de pessoa exigem desambiguação (vários candidatos próximos).
 * A interface nunca escolhe sozinha entre homônimos.
 */
export function needsDisambiguation(hits: PersonHit[]): boolean {
  if (hits.length < 2) return false;
  return hits[1].similarity >= hits[0].similarity - 0.15;
}

export type PropositionFilters = { group?: "norma" | "requerimento" | "emenda_parecer" | "todos"; ano?: number; codTema?: number; matchAny?: boolean };

export async function searchPropositions(q: string, filters: PropositionFilters = {}, limit = 20): Promise<PropositionHit[]> {
  const ident = parsePropositionIdentifier(q);
  const groupTypes = filters.group && filters.group !== "todos" ? groupSiglas(filters.group) : null;
  const where = [
    groupTypes ? sql`p.sigla_tipo in ${groupTypes}` : sql`true`,
    filters.ano ? sql`p.ano = ${filters.ano}` : sql`true`,
    filters.codTema ? sql`exists (select 1 from proposition_themes t where t.proposition_id = p.id and t.cod_tema = ${filters.codTema})` : sql`true`,
  ];
  const whereSql = sql.join(where, sql` and `);
  if (ident) {
    const rows = await db.execute<RawProp>(sql`
      select p.id, p.external_id, p.sigla_tipo, p.numero, p.ano, p.ementa, p.status_situacao, p.presented_at, 1.0 as rank
      from propositions p
      where p.sigla_tipo = ${ident.siglaTipo} and p.numero = ${ident.numero} and p.ano = ${ident.ano}
      limit 5`);
    if (rows.length) return rows.map(mapProp);
  }
  const term = q.trim();
  if (!term) return [];
  const any = filters.matchAny ? orQuery(term) : null;
  if (filters.matchAny && !any) return [];
  const tq = any ? sql`to_tsquery('portuguese', ${any})` : sql`websearch_to_tsquery('portuguese', immutable_unaccent(${term}))`;
  const rows = await db.execute<RawProp>(sql`
    with q as (select ${tq} as tq)
    select p.id, p.external_id, p.sigla_tipo, p.numero, p.ano, p.ementa, p.status_situacao, p.presented_at,
      ts_rank_cd(p.search_vector, q.tq) * (case when p.sigla_tipo in ('PL','PLP','PEC','PDL','MPV') then 1.5 else 1 end) as rank
    from propositions p, q
    where p.search_vector @@ q.tq and ${whereSql}
    order by rank desc, p.presented_at desc nulls last
    limit ${limit}`);
  return rows.map(mapProp);
}

type RawProp = {
  id: string;
  external_id: string;
  sigla_tipo: string;
  numero: number;
  ano: number;
  ementa: string;
  status_situacao: string | null;
  presented_at: string | Date | null;
  rank: number;
};

const mapProp = (r: RawProp): PropositionHit => ({
  id: r.id,
  externalId: r.external_id,
  siglaTipo: r.sigla_tipo,
  numero: Number(r.numero),
  ano: Number(r.ano),
  ementa: r.ementa,
  statusSituacao: r.status_situacao,
  presentedAt: r.presented_at ? new Date(r.presented_at) : null,
  rank: Number(r.rank),
});

export function groupSiglas(group: "norma" | "requerimento" | "emenda_parecer"): string[] {
  const all = ["PL", "PLP", "PEC", "PDL", "PLV", "MPV", "PRC", "PLN", "REQ", "RIC", "INC", "RCP", "REL", "SIT", "EMC", "EMP", "EMA", "EMS", "SBT", "SBE", "PRL", "PAR", "PPP", "DTQ", "ESB", "EMR"];
  return all.filter((s) => typeGroup(s) === group);
}

export type NewsFilters = { topicSlug?: string; sinceHours?: number; sourceId?: string; matchAny?: boolean };

export async function searchNews(q: string, filters: NewsFilters = {}, limit = 20): Promise<NewsHit[]> {
  const term = q.trim();
  if (!term) return [];
  const any = filters.matchAny ? orQuery(term) : null;
  if (filters.matchAny && !any) return [];
  const tq = any ? sql`to_tsquery('portuguese', ${any})` : sql`websearch_to_tsquery('portuguese', immutable_unaccent(${term}))`;
  const where = [
    filters.topicSlug ? sql`n.topic_slug = ${filters.topicSlug}` : sql`true`,
    filters.sourceId ? sql`n.source_id = ${filters.sourceId}` : sql`true`,
    filters.sinceHours ? sql`n.published_at >= now() - make_interval(hours => ${filters.sinceHours})` : sql`true`,
  ];
  const rows = await db.execute<{ id: string; title: string; lead: string; url: string; topic_slug: string | null; source_id: string; published_at: string; rank: number }>(sql`
    with q as (select ${tq} as tq)
    select n.id, n.title, n.lead, n.url, n.topic_slug, n.source_id, n.published_at,
      ts_rank_cd(n.search_vector, q.tq) as rank
    from news_articles n, q
    where n.search_vector @@ q.tq and ${sql.join(where, sql` and `)}
    order by rank desc, n.published_at desc
    limit ${limit}`);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    lead: r.lead,
    url: r.url,
    topicSlug: r.topic_slug,
    sourceId: r.source_id,
    publishedAt: new Date(r.published_at),
    rank: Number(r.rank),
  }));
}
