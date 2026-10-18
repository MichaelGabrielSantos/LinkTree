/**
 * Ordenação do "Panorama". É uma escolha editorial do produto, publicada em /metodologia.
 * Não usa engajamento, posicionamento político inferido nem dados da pessoa.
 *
 * pontuação = 0,35·atualidade + 0,25·alcance + 0,20·relevância pública + 0,20·evidência
 * depois, reordenação gulosa por diversidade temática (penalidade por tema repetido).
 */

export const RANKING_VERSION = "panorama-v1";

export const WEIGHTS = { recency: 0.35, reach: 0.25, publicRelevance: 0.2, evidence: 0.2 } as const;
/** Meia-vida da atualidade em horas. */
export const RECENCY_HALF_LIFE_H = 12;
/** Penalidade aplicada por item do mesmo tema já selecionado acima. */
export const DIVERSITY_PENALTY = 0.12;
/** Texto disponível a partir do qual consideramos a evidência "completa" para a pontuação. */
export const EVIDENCE_FULL_CHARS = 1500;

export type RankInput = {
  id: string;
  topicSlug: string | null;
  publishedAt: Date;
  clusterSize: number;
  sourceCount: number;
  topicWeight: number;
  availableTextChars: number;
};

export type RankBreakdown = { recency: number; reach: number; publicRelevance: number; evidence: number; base: number; diversityPenalty: number; final: number };

export function scoreItem(item: RankInput, now: Date): Omit<RankBreakdown, "diversityPenalty" | "final"> {
  const ageH = Math.max(0, (now.getTime() - item.publishedAt.getTime()) / 3600_000);
  const recency = Math.pow(0.5, ageH / RECENCY_HALF_LIFE_H);
  // Alcance: mais matérias e mais veículos sobre o mesmo acontecimento → maior alcance. Satura em 5 matérias/3 veículos.
  const reach = 0.6 * Math.min(1, Math.log2(1 + item.clusterSize) / Math.log2(6)) + 0.4 * Math.min(1, (item.sourceCount - 1) / 2);
  const publicRelevance = Math.max(0, Math.min(1, item.topicWeight));
  const evidence = Math.min(1, item.availableTextChars / EVIDENCE_FULL_CHARS);
  const base =
    WEIGHTS.recency * recency + WEIGHTS.reach * reach + WEIGHTS.publicRelevance * publicRelevance + WEIGHTS.evidence * evidence;
  return { recency, reach, publicRelevance, evidence, base };
}

export function rankPanorama<T extends RankInput>(items: T[], now: Date): Array<T & { rank: RankBreakdown }> {
  const scored = items.map((it) => ({ it, s: scoreItem(it, now) }));
  const remaining = [...scored];
  const out: Array<T & { rank: RankBreakdown }> = [];
  const topicCount = new Map<string, number>();
  while (remaining.length) {
    let bestIdx = 0;
    let bestFinal = -Infinity;
    let bestPenalty = 0;
    remaining.forEach((r, i) => {
      const penalty = DIVERSITY_PENALTY * (topicCount.get(r.it.topicSlug ?? "_") ?? 0);
      const final = r.s.base - penalty;
      // Desempate determinístico: mais recente, depois id.
      if (
        final > bestFinal + 1e-12 ||
        (Math.abs(final - bestFinal) <= 1e-12 &&
          (r.it.publishedAt > remaining[bestIdx].it.publishedAt ||
            (r.it.publishedAt.getTime() === remaining[bestIdx].it.publishedAt.getTime() && r.it.id < remaining[bestIdx].it.id)))
      ) {
        bestIdx = i;
        bestFinal = final;
        bestPenalty = penalty;
      }
    });
    const [chosen] = remaining.splice(bestIdx, 1);
    const key = chosen.it.topicSlug ?? "_";
    topicCount.set(key, (topicCount.get(key) ?? 0) + 1);
    out.push({ ...chosen.it, rank: { ...chosen.s, diversityPenalty: bestPenalty, final: bestFinal } });
  }
  return out;
}
