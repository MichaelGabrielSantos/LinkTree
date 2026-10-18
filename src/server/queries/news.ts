import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { eventClusters, newsArticles, newsArticleVersions, sources, topics } from "../db/schema";
import { rankPanorama, type RankBreakdown } from "@/domain/ranking";

export type NewsCard = {
  id: string;
  title: string;
  lead: string;
  url: string;
  sourceId: string;
  sourceName: string;
  topicSlug: string | null;
  topicName: string | null;
  publishedAt: Date;
  clusterId: number | null;
  clusterSize: number;
  sourceCount: number;
  feedTextLength: number;
  version: number;
  related: Array<{ id: string; title: string; sourceName: string; publishedAt: Date }>;
  rank?: RankBreakdown;
  reasons?: string[];
};

export type FeedOptions = {
  sinceHours?: number;
  topicSlugs?: string[];
  sourceId?: string;
  sort?: "panorama" | "cronologica";
  limit?: number;
};

async function loadCandidates(opts: FeedOptions) {
  const since = opts.sinceHours ?? 48;
  const rows = await db.execute<{
    id: string; title: string; lead: string; url: string; source_id: string; source_name: string; topic_slug: string | null;
    topic_name: string | null; topic_weight: number | null; published_at: string; cluster_id: number | null; cluster_size: number | null;
    source_count: number | null; feed_text_length: number; version: number;
  }>(sql`
    select n.id, n.title, n.lead, n.url, n.source_id, s.name as source_name, n.topic_slug, t.name as topic_name,
      t.public_relevance_weight as topic_weight, n.published_at, n.cluster_id, c.size as cluster_size, c.source_count,
      n.feed_text_length, n.version
    from news_articles n
    join sources s on s.id = n.source_id
    left join topics t on t.slug = n.topic_slug
    left join event_clusters c on c.id = n.cluster_id
    where n.published_at >= now() - make_interval(hours => ${since})
      ${opts.topicSlugs?.length ? sql`and n.topic_slug in ${opts.topicSlugs}` : sql``}
      ${opts.sourceId ? sql`and n.source_id = ${opts.sourceId}` : sql``}
    order by n.published_at desc
    limit 400`);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    lead: r.lead,
    url: r.url,
    sourceId: r.source_id,
    sourceName: r.source_name,
    topicSlug: r.topic_slug,
    topicName: r.topic_name,
    topicWeight: Number(r.topic_weight ?? 0.8),
    publishedAt: new Date(r.published_at),
    clusterId: r.cluster_id,
    clusterSize: Number(r.cluster_size ?? 1),
    sourceCount: Number(r.source_count ?? 1),
    feedTextLength: Number(r.feed_text_length),
    version: Number(r.version),
  }));
}

/** Agrupa por acontecimento: um cartão por grupo, preservando as demais matérias em `related`. */
function groupByCluster<T extends { id: string; clusterId: number | null; publishedAt: Date; title: string; sourceName: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const key = it.clusterId ? `c${it.clusterId}` : `a${it.id}`;
    const g = groups.get(key) ?? [];
    g.push(it);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const sorted = [...g].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    return { lead: sorted[0], related: sorted.slice(1).map((r) => ({ id: r.id, title: r.title, sourceName: r.sourceName, publishedAt: r.publishedAt })) };
  });
}

export async function getFeed(opts: FeedOptions = {}): Promise<NewsCard[]> {
  const candidates = await loadCandidates(opts);
  const grouped = groupByCluster(candidates).map(({ lead, related }) => ({
    ...lead,
    related,
    clusterSize: Math.max(lead.clusterSize, related.length + 1),
  }));
  const limit = opts.limit ?? 40;
  if (opts.sort === "cronologica") return grouped.slice(0, limit);
  const ranked = rankPanorama(
    grouped.map((g) => ({ ...g, availableTextChars: g.feedTextLength })),
    new Date(),
  );
  return ranked.slice(0, limit);
}

export type InterestSignals = { topicSlugs: string[]; personNames: Array<{ id: string; name: string }> };

/** "Seus interesses": só temas e pessoas que a própria pessoa escolheu seguir. Cada item explica o porquê. */
export async function getInterestFeed(signals: InterestSignals, opts: FeedOptions = {}): Promise<NewsCard[]> {
  if (!signals.topicSlugs.length && !signals.personNames.length) return [];
  const candidates = await loadCandidates({ ...opts, topicSlugs: undefined });
  const topicNames = new Map((await db.select({ slug: topics.slug, name: topics.name }).from(topics)).map((t) => [t.slug, t.name]));
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const out: NewsCard[] = [];
  for (const g of groupByCluster(candidates)) {
    const it = g.lead;
    const reasons: string[] = [];
    if (it.topicSlug && signals.topicSlugs.includes(it.topicSlug)) reasons.push(`Você segue o tema ${topicNames.get(it.topicSlug) ?? it.topicSlug}`);
    const hay = norm(`${it.title} ${it.lead}`);
    for (const p of signals.personNames) {
      if (p.name.split(/\s+/).length >= 2 && hay.includes(norm(p.name))) reasons.push(`Menciona o nome "${p.name}", que você segue (correspondência de texto; pode ser homônimo)`);
    }
    if (reasons.length) out.push({ ...it, related: g.related, reasons });
  }
  return out.slice(0, opts.limit ?? 20);
}

export async function getNewsArticle(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await db
    .select({ a: newsArticles, s: sources, topicName: topics.name })
    .from(newsArticles)
    .innerJoin(sources, eq(sources.id, newsArticles.sourceId))
    .leftJoin(topics, eq(topics.slug, newsArticles.topicSlug))
    .where(eq(newsArticles.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const [versions, cluster] = await Promise.all([
    db.select().from(newsArticleVersions).where(eq(newsArticleVersions.articleId, id)).orderBy(desc(newsArticleVersions.version)),
    row.a.clusterId
      ? db
          .select({ id: newsArticles.id, title: newsArticles.title, url: newsArticles.url, publishedAt: newsArticles.publishedAt, sourceName: sources.name })
          .from(newsArticles)
          .innerJoin(sources, eq(sources.id, newsArticles.sourceId))
          .where(sql`${newsArticles.clusterId} = ${row.a.clusterId} and ${newsArticles.id} <> ${id}`)
          .orderBy(asc(newsArticles.publishedAt))
      : Promise.resolve([]),
  ]);
  const clusterRow = row.a.clusterId ? await db.query.eventClusters.findFirst({ where: eq(eventClusters.id, row.a.clusterId) }) : null;
  return { article: row.a, source: row.s, topicName: row.topicName, versions, related: cluster, cluster: clusterRow ?? null };
}

export async function lastSuccessfulRun(job: string) {
  const rows = await db.execute<{ finished_at: string | null; status: string }>(sql`
    select finished_at, status from ingestion_runs where job = ${job} and status in ('success','partial') order by finished_at desc nulls last limit 1`);
  return rows[0] ? { finishedAt: rows[0].finished_at ? new Date(rows[0].finished_at) : null, status: rows[0].status } : null;
}

export async function lastRun(job: string) {
  const rows = await db.execute<{ finished_at: string | null; started_at: string; status: string; error: string | null }>(sql`
    select finished_at, started_at, status, error from ingestion_runs where job = ${job} order by started_at desc limit 1`);
  return rows[0] ? { ...rows[0], startedAt: new Date(rows[0].started_at), finishedAt: rows[0].finished_at ? new Date(rows[0].finished_at) : null } : null;
}
