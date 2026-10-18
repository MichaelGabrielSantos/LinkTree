import { contentTokens } from "@/lib/text";

/**
 * Agrupamento conservador por semelhança de título (Jaccard sobre palavras de conteúdo).
 * Preferimos deixar duas matérias separadas a juntar acontecimentos diferentes.
 */
export const CLUSTER_THRESHOLD = 0.5;

export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(contentTokens(a));
  const tb = new Set(contentTokens(b));
  if (ta.size < 3 || tb.size < 3) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function assignCluster(
  title: string,
  candidates: Array<{ id: string; title: string; clusterId: number | null }>,
): { articleId: string; clusterId: number | null; score: number } | null {
  let best: { articleId: string; clusterId: number | null; score: number } | null = null;
  for (const c of candidates) {
    const score = titleSimilarity(title, c.title);
    if (score >= CLUSTER_THRESHOLD && (!best || score > best.score)) best = { articleId: c.id, clusterId: c.clusterId, score };
  }
  return best;
}
