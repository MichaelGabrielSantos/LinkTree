import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { listFollows } from "../user-data";
import { ROLE_LABEL, roleOf } from "@/domain/authorship";

export type UpdateItem = {
  type: "noticia" | "novo_projeto" | "tramitacao" | "atualizacao_fonte";
  at: Date;
  title: string;
  href: string;
  because: string;
};

export type UpdateGroup = { key: string; type: UpdateItem["type"]; because: string; items: UpdateItem[] };

export const UPDATE_TYPE_LABEL: Record<UpdateItem["type"], string> = {
  noticia: "Notícia",
  novo_projeto: "Novo projeto",
  tramitacao: "Mudança de tramitação",
  atualizacao_fonte: "Atualização/correção na fonte",
};

/** Atualizações dos itens seguidos, separadas por tipo e agrupadas para evitar alertas repetidos. */
export async function followingUpdates(userId: string, days: number): Promise<{ groups: UpdateGroup[]; followCount: number }> {
  const fs = await listFollows(userId);
  const items: UpdateItem[] = [];
  const personIds = fs.filter((f) => f.targetType === "person").map((f) => f.targetId);
  const topicSlugs = fs.filter((f) => f.targetType === "topic").map((f) => f.targetId);
  const propIds = fs.filter((f) => f.targetType === "proposition").map((f) => f.targetId);

  if (personIds.length) {
    const rows = await db.execute<{ id: string; label: string; ementa: string; presented_at: string; person: string; proponent: boolean | null; signature_order: number | null }>(sql`
      select p.id, p.sigla_tipo || ' ' || p.numero || '/' || p.ano as label, p.ementa, p.presented_at, pe.name as person, pa.proponent, pa.signature_order
      from proposition_authors pa join propositions p on p.id = pa.proposition_id join persons pe on pe.id = pa.person_id
      where pa.person_id::text in ${personIds} and p.presented_at >= now() - make_interval(days => ${days})
      order by p.presented_at desc limit 200`);
    for (const r of rows) {
      items.push({
        type: "novo_projeto",
        at: new Date(r.presented_at),
        title: `${r.label} — ${r.ementa.slice(0, 160)}`,
        href: `/projetos/${r.id}`,
        because: `${r.person} (${ROLE_LABEL[roleOf(r.proponent, r.signature_order)].toLowerCase()})`,
      });
    }
    const st = await db.execute<{ id: string; label: string; status: string | null; status_at: string; person: string }>(sql`
      select distinct on (p.id) p.id, p.sigla_tipo || ' ' || p.numero || '/' || p.ano as label, coalesce(p.status_situacao, p.status_tramitacao) as status, p.status_at, pe.name as person
      from proposition_authors pa join propositions p on p.id = pa.proposition_id join persons pe on pe.id = pa.person_id
      where pa.person_id::text in ${personIds} and pa.proponent is true and p.status_at >= now() - make_interval(days => ${days})
        and (p.presented_at is null or p.status_at > p.presented_at + interval '1 day')
      order by p.id, p.status_at desc limit 200`);
    for (const r of st) {
      items.push({ type: "tramitacao", at: new Date(r.status_at), title: `${r.label}: ${r.status ?? "movimentação"}`, href: `/projetos/${r.id}`, because: `Projeto de autoria ou coautoria de ${r.person}` });
    }
  }
  if (topicSlugs.length) {
    const rows = await db.execute<{ id: string; title: string; published_at: string; topic: string; version: number }>(sql`
      select n.id, n.title, n.published_at, t.name as topic, n.version from news_articles n join topics t on t.slug = n.topic_slug
      where n.topic_slug in ${topicSlugs} and n.published_at >= now() - make_interval(days => ${days})
      order by n.published_at desc limit 100`);
    for (const r of rows) {
      items.push({ type: r.version > 1 ? "atualizacao_fonte" : "noticia", at: new Date(r.published_at), title: r.title, href: `/noticias/${r.id}`, because: `Tema ${r.topic}` });
    }
  }
  if (propIds.length) {
    const rows = await db.execute<{ id: string; label: string; descr: string | null; at: string; orgao: string | null }>(sql`
      select p.id, p.sigla_tipo || ' ' || p.numero || '/' || p.ano as label, t.descricao_tramitacao as descr, t.at, t.orgao
      from tramitacoes t join propositions p on p.id = t.proposition_id
      where p.id::text in ${propIds} and t.at >= now() - make_interval(days => ${days})
      order by t.at desc limit 100`);
    for (const r of rows) {
      items.push({ type: "tramitacao", at: new Date(r.at), title: `${r.label}: ${r.descr ?? "movimentação"} (${r.orgao ?? "—"})`, href: `/projetos/${r.id}`, because: "Projeto que você segue" });
    }
  }

  const groups = new Map<string, UpdateGroup>();
  for (const it of items.sort((a, b) => b.at.getTime() - a.at.getTime())) {
    const key = `${it.type}|${it.because}`;
    const g = groups.get(key) ?? { key, type: it.type, because: it.because, items: [] };
    if (!g.items.some((x) => x.href === it.href && x.title === it.title)) g.items.push(it);
    groups.set(key, g);
  }
  return { groups: [...groups.values()], followCount: fs.length };
}
