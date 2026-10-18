import Link from "next/link";
import type { NewsCard as NewsCardData } from "@/server/queries/news";
import { formatDateTime, relativeTime } from "@/lib/format";
import { truncateAtSentence } from "@/lib/text";
import { Badge } from "./ui";
import { SaveButton } from "./actions-ui";

export function NewsCard({ item, saved, next, showRank = false }: { item: NewsCardData; saved: boolean; next: string; showRank?: boolean }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4 sm:p-5" aria-labelledby={`n-${item.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        {item.topicName && <Badge>{item.topicName}</Badge>}
        <span>{item.sourceName}</span>
        <span aria-hidden>·</span>
        <time dateTime={item.publishedAt.toISOString()} title={formatDateTime(item.publishedAt)}>
          {relativeTime(item.publishedAt)}
        </time>
        {item.version > 1 && <Badge tone="warn">atualizada pela fonte</Badge>}
      </div>
      <h3 id={`n-${item.id}`} className="mt-2 font-serif text-lg leading-snug text-ink sm:text-xl">
        <Link href={`/noticias/${item.id}`} className="hover:underline">
          {item.title}
        </Link>
      </h3>
      <p className="mt-1.5 text-sm text-ink-2">{truncateAtSentence(item.lead, 240)}</p>
      {item.reasons?.length ? (
        <p className="mt-2 text-xs text-ink-3">
          <span className="font-semibold">Por que aparece aqui:</span> {item.reasons.join(" · ")}
        </p>
      ) : null}
      {item.related.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-ink-2">
            Mesmo acontecimento: mais {item.related.length} matéria{item.related.length > 1 ? "s" : ""}
          </summary>
          <ul className="mt-1 space-y-1 pl-4">
            {item.related.map((r) => (
              <li key={r.id}>
                <Link href={`/noticias/${r.id}`} className="underline">
                  {r.title}
                </Link>{" "}
                <span className="text-ink-3">
                  — {r.sourceName}, {formatDateTime(r.publishedAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {showRank && item.rank && (
        <details className="mt-2 text-xs text-ink-3">
          <summary className="cursor-pointer">Por que está nesta posição</summary>
          <p className="mt-1">
            Atualidade {item.rank.recency.toFixed(2)} · alcance {item.rank.reach.toFixed(2)} · relevância pública do tema {item.rank.publicRelevance.toFixed(2)} ·
            evidência disponível {item.rank.evidence.toFixed(2)} → base {item.rank.base.toFixed(3)}
            {item.rank.diversityPenalty > 0 && ` − diversidade ${item.rank.diversityPenalty.toFixed(2)}`}.{" "}
            <Link href="/metodologia#panorama" className="underline">
              Como calculamos
            </Link>
          </p>
        </details>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={`/noticias/${item.id}`} className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
          Abrir
        </Link>
        <Link href={`/noticias/${item.id}#entender`} className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
          Explicar
        </Link>
        <SaveButton itemType="news" itemId={item.id} saved={saved} next={next} />
      </div>
    </article>
  );
}
