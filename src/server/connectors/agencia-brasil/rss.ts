import { XMLParser } from "fast-xml-parser";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { eventClusters, newsArticles, newsArticleVersions, topics } from "../../db/schema";
import { fetchWithRetry, readLimited } from "../http";
import { withRun } from "../../ingestion/runs";
import { htmlToPlainText, truncateAtSentence } from "@/lib/text";
import { stableHash } from "@/lib/hash";
import { assignCluster } from "@/domain/clustering";

const SOURCE = "agencia-brasil";

/** Feeds verificados em 2026-10-18 (HTTP 200, application/rss+xml). */
export const AGENCIA_BRASIL_FEEDS = [
  "politica",
  "economia",
  "geral",
  "internacional",
  "saude",
  "educacao",
  "meio-ambiente",
  "direitos-humanos",
  "justica",
  "cultura",
  "esportes",
] as const;

/** Limite do trecho guardado/exibido. A licença do texto integral não foi confirmada (ver catálogo de fontes). */
export const LEAD_MAX_CHARS = 600;

export type ParsedItem = {
  guid: string;
  url: string;
  title: string;
  lead: string;
  feedTextLength: number;
  sourceCategory: string | null;
  tags: string[];
  author: string | null;
  imageUrl: string | null;
  publishedAt: Date;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", processEntities: true });

type XmlNode = string | { "#text"?: string; [k: string]: unknown };
const textOf = (n: XmlNode | undefined): string => (n == null ? "" : typeof n === "string" ? n : String(n["#text"] ?? ""));
const asArray = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Remove marcas do feed que não são conteúdo (logo, pixels de rastreamento). */
function cleanFeedText(html: string): string {
  return htmlToPlainText(html)
    .split("\n")
    .filter((l) => !/^logo ag[eê]ncia brasil$/i.test(l))
    .join("\n");
}

export function parseAgenciaBrasilFeed(xml: string): { items: ParsedItem[]; invalid: number } {
  const doc = parser.parse(xml);
  const rawItems = asArray(doc?.rss?.channel?.item);
  const items: ParsedItem[] = [];
  let invalid = 0;
  for (const it of rawItems) {
    const title = htmlToPlainText(textOf(it.title));
    const url = textOf(it.link).trim();
    const guid = textOf(it.guid).trim() || url;
    const published = new Date(textOf(it.pubDate));
    if (!title || !url.startsWith("https://agenciabrasil.ebc.com.br/") || Number.isNaN(published.getTime())) {
      invalid++;
      continue;
    }
    const body = cleanFeedText(textOf(it.description));
    const categories = asArray(it.category as XmlNode | XmlNode[]).map((c) => ({
      name: textOf(c).trim(),
      domain: typeof c === "object" ? String(c["@_domain"] ?? "") : "",
    }));
    const editoria = categories.find((c) => c.domain && !c.domain.includes("/tags/"))?.name ?? null;
    const tags = categories.filter((c) => c.domain.includes("/tags/")).map((c) => c.name);
    items.push({
      guid,
      url,
      title,
      lead: truncateAtSentence(body.replace(/\n/g, " "), LEAD_MAX_CHARS),
      feedTextLength: body.length,
      sourceCategory: editoria,
      tags: [...new Set(tags)].slice(0, 12),
      author: textOf(it["dc:creator"]).trim() || null,
      imageUrl: textOf(it["imagem-destaque"]).trim() || null,
      publishedAt: published,
    });
  }
  return { items, invalid };
}

export async function syncAgenciaBrasil(feeds: readonly string[] = AGENCIA_BRASIL_FEEDS) {
  return withRun(SOURCE, "agencia-brasil:rss", { feeds }, async (ctx) => {
    const topicRows = await db.select().from(topics);
    const topicByCategory = new Map<string, string>();
    for (const t of topicRows) for (const c of t.newsCategories) topicByCategory.set(c.toLowerCase(), t.slug);

    const seen = new Map<string, ParsedItem>();
    for (const feed of feeds) {
      try {
        const res = await fetchWithRetry(`https://agenciabrasil.ebc.com.br/rss/${feed}/feed.xml`, {
          accept: "application/rss+xml, application/xml",
          onRequest: ctx.countRequest,
        });
        const xml = new TextDecoder().decode(await readLimited(res, 5 * 1024 * 1024));
        const { items, invalid } = parseAgenciaBrasilFeed(xml);
        if (invalid) ctx.errors.push(`${feed}: ${invalid} item(ns) inválido(s) ignorado(s)`);
        for (const item of items) seen.set(item.guid, item);
      } catch (err) {
        // Um feed com falha não impede os demais; dados anteriores permanecem.
        ctx.errors.push(`${feed}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (seen.size === 0 && ctx.errors.length) throw new Error("Nenhum feed respondeu");

    const guids = [...seen.keys()];
    const existing = guids.length
      ? await db
          .select({ id: newsArticles.id, externalId: newsArticles.externalId, contentHash: newsArticles.contentHash, version: newsArticles.version })
          .from(newsArticles)
          .where(and(eq(newsArticles.sourceId, SOURCE), inArray(newsArticles.externalId, guids)))
      : [];
    const byGuid = new Map(existing.map((e) => [e.externalId, e]));

    for (const item of seen.values()) {
      ctx.seen++;
      const topicSlug = item.sourceCategory ? topicByCategory.get(item.sourceCategory.toLowerCase()) ?? null : null;
      const hash = stableHash({ title: item.title, lead: item.lead, url: item.url });
      const prev = byGuid.get(item.guid);
      const fields = {
        url: item.url,
        title: item.title,
        lead: item.lead,
        feedTextLength: item.feedTextLength,
        topicSlug,
        sourceCategory: item.sourceCategory,
        tags: item.tags,
        author: item.author,
        imageUrl: item.imageUrl,
        publishedAt: item.publishedAt,
      };
      if (!prev) {
        const [row] = await db
          .insert(newsArticles)
          .values({ sourceId: SOURCE, externalId: item.guid, contentHash: hash, version: 1, ...fields })
          .onConflictDoNothing()
          .returning({ id: newsArticles.id });
        if (!row) {
          ctx.unchanged++;
          continue;
        }
        await db.insert(newsArticleVersions).values({ articleId: row.id, version: 1, contentHash: hash, title: item.title, lead: item.lead });
        await clusterArticle(row.id, item);
        ctx.created++;
      } else if (prev.contentHash !== hash) {
        const version = prev.version + 1;
        await db.transaction(async (tx) => {
          await tx.update(newsArticles).set({ ...fields, contentHash: hash, version, updatedAt: sql`now()` }).where(eq(newsArticles.id, prev.id));
          await tx.insert(newsArticleVersions).values({ articleId: prev.id, version, contentHash: hash, title: item.title, lead: item.lead }).onConflictDoNothing();
        });
        ctx.updated++;
      } else {
        ctx.unchanged++;
      }
    }
  });
}

/** Agrupa a matéria com acontecimentos dos últimos 3 dias. Divergências entre versões permanecem nas matérias. */
async function clusterArticle(articleId: string, item: ParsedItem) {
  const since = new Date(item.publishedAt.getTime() - 72 * 3600_000);
  const candidates = await db
    .select({ id: newsArticles.id, title: newsArticles.title, clusterId: newsArticles.clusterId, sourceId: newsArticles.sourceId })
    .from(newsArticles)
    .where(and(gte(newsArticles.publishedAt, since), sql`${newsArticles.id} <> ${articleId}`));
  const match = assignCluster(item.title, candidates);
  if (match?.clusterId) {
    await db.update(newsArticles).set({ clusterId: match.clusterId }).where(eq(newsArticles.id, articleId));
    await db.execute(sql`
      update event_clusters c set
        size = (select count(*) from news_articles a where a.cluster_id = c.id),
        source_count = (select count(distinct source_id) from news_articles a where a.cluster_id = c.id),
        last_seen_at = greatest(c.last_seen_at, ${item.publishedAt.toISOString()}::timestamptz)
      where c.id = ${match.clusterId}`);
    return;
  }
  const [cluster] = await db
    .insert(eventClusters)
    .values({ label: item.title, firstSeenAt: item.publishedAt, lastSeenAt: item.publishedAt, size: 1, sourceCount: 1 })
    .returning({ id: eventClusters.id });
  await db.update(newsArticles).set({ clusterId: cluster.id }).where(eq(newsArticles.id, articleId));
  if (match && !match.clusterId) {
    // Candidato semelhante ainda sem grupo: junta os dois no novo grupo.
    await db.update(newsArticles).set({ clusterId: cluster.id }).where(eq(newsArticles.id, match.articleId));
    await db.update(eventClusters).set({ size: 2 }).where(eq(eventClusters.id, cluster.id));
  }
}
