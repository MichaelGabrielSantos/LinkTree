export type StatusEvent = { at: Date; party: string | null; uf: string | null; legislature: number | null; description: string | null };

export type PartySegment = { party: string; from: Date; to: Date | null; legislatures: number[] };

/**
 * Constrói períodos partidários a partir dos eventos datados da fonte.
 * As datas são as dos registros de mudança na Câmara, que podem diferir da data formal de filiação.
 * Um evento sem partido não encerra nem abre período.
 */
export function partyTimeline(events: StatusEvent[]): PartySegment[] {
  const sorted = [...events].filter((e) => e.party).sort((a, b) => a.at.getTime() - b.at.getTime());
  const segments: PartySegment[] = [];
  for (const e of sorted) {
    const last = segments[segments.length - 1];
    if (last && last.party === e.party) {
      if (e.legislature && !last.legislatures.includes(e.legislature)) last.legislatures.push(e.legislature);
      continue;
    }
    if (last) last.to = e.at;
    segments.push({ party: e.party!, from: e.at, to: null, legislatures: e.legislature ? [e.legislature] : [] });
  }
  return segments;
}

/** Partido registrado em uma data. Retorna null se não houver registro anterior à data (não presume o atual). */
export function partyAt(segments: PartySegment[], date: Date): string | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].from.getTime() <= date.getTime()) return segments[i].party;
  }
  return null;
}
