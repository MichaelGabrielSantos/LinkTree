import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { topics } from "@/server/db/schema";
import { getFeed } from "@/server/queries/news";
import { getCurrentUser } from "@/server/auth";
import { isFollowing, savedIdSet } from "@/server/user-data";
import { FollowButton } from "@/components/actions-ui";
import { NewsCard } from "@/components/news-card";
import { PropositionGrid } from "@/components/proposition-card";
import { EmptyState, PageHeader, SectionTitle, TOPIC_ICON } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TemaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const topic = await db.query.topics.findFirst({ where: eq(topics.slug, slug) });
  if (!topic) notFound();
  const user = await getCurrentUser();
  const [feed, following] = await Promise.all([
    getFeed({ topicSlugs: [slug], sinceHours: 24 * 7, sort: "cronologica", limit: 15 }),
    user ? isFollowing(user.id, { targetType: "topic", targetId: slug }) : Promise.resolve(false),
  ]);
  const saved = user ? await savedIdSet(user.id, "news", feed.map((f) => f.id)) : new Set<string>();
  const props = topic.camaraThemeCodes.length
    ? await db.execute<{ id: string; sigla_tipo: string; numero: number; ano: number; ementa: string; presented_at: string | null; status_situacao: string | null; status_tramitacao: string | null; status_orgao: string | null }>(sql`
        select p.id, p.sigla_tipo, p.numero, p.ano, p.ementa, p.presented_at, p.status_situacao, p.status_tramitacao, p.status_orgao from propositions p
        where p.sigla_tipo in ('PL','PLP','PEC','PDL') and exists (select 1 from proposition_themes t where t.proposition_id = p.id and t.cod_tema in ${topic.camaraThemeCodes})
        order by p.presented_at desc nulls last limit 10`)
    : [];
  return (
    <>
      <PageHeader eyebrow="Tema" title={`${TOPIC_ICON[topic.slug] ?? ""} ${topic.name}`}>{topic.description}</PageHeader>
      <FollowButton targetType="topic" targetId={slug} following={following} next={`/temas/${slug}`} label="tema" />
      <SectionTitle>Notícias dos últimos 7 dias</SectionTitle>
      {topic.newsCategories.length === 0 && <p className="mb-2 text-sm text-ink-2">Ainda não há fonte de notícias integrada para este tema.</p>}
      {feed.length === 0 ? <EmptyState title="Sem notícias neste período" /> : <div className="grid gap-3 sm:grid-cols-2">{feed.map((n) => <NewsCard key={n.id} item={n} saved={saved.has(n.id)} next={`/temas/${slug}`} />)}</div>}
      <SectionTitle>Projetos apresentados recentemente</SectionTitle>
      <p className="-mt-2 mb-2 text-xs text-ink-3">Classificação temática da Câmara (códigos {topic.camaraThemeCodes.join(", ") || "—"}).</p>
      {props.length === 0 ? <p className="text-sm text-ink-2">Nenhum projeto mapeado para este tema.</p> : (
        <PropositionGrid items={props.map((p) => ({ id: p.id, siglaTipo: p.sigla_tipo, numero: Number(p.numero), ano: Number(p.ano), ementa: p.ementa, presentedAt: p.presented_at ? new Date(p.presented_at) : null, statusSituacao: p.status_situacao, statusTramitacao: p.status_tramitacao, statusOrgao: p.status_orgao }))} />
      )}
    </>
  );
}
