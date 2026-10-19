import Link from "next/link";
import type { NewsCard as NewsCardData } from "@/server/queries/news";
import { formatDateTime, relativeTime } from "@/lib/format";
import { truncateAtSentence } from "@/lib/text";
import { TopicIcon } from "./ui";
import { SaveButton } from "./actions-ui";

export function NewsCard({
  item,
  saved,
  next,
  showRank = false,
  featured = false,
}: {
  item: NewsCardData;
  saved: boolean;
  next: string;
  showRank?: boolean;
  featured?: boolean;
}) {
  return (
    <article
      className={`relative flex h-full flex-col rounded-2xl border border-line bg-surface shadow-card transition hover:border-ink-3 ${featured ? "p-5 sm:p-7" : "p-4 sm:p-5"}`}
      aria-labelledby={`n-${item.id}`}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        {item.topicName && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 font-medium text-ink-2">
            <TopicIcon slug={item.topicSlug} /> {item.topicName}
          </span>
        )}
        <time dateTime={item.publishedAt.toISOString()} title={formatDateTime(item.publishedAt)}>
          {relativeTime(item.publishedAt)}
        </time>
        {item.version > 1 && <span className="font-medium text-warn-ink">· atualizada pela fonte</span>}
      </p>
      <h3 id={`n-${item.id}`} className={`mt-2 font-serif leading-snug text-ink ${featured ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"}`}>
        <Link href={`/noticias/${item.id}`} className="after:absolute after:inset-0 after:content-['']">
          {item.title}
        </Link>
      </h3>
      <p className={`mt-2 text-ink-2 ${featured ? "line-clamp-4 text-base" : "line-clamp-3 text-sm"}`}>{truncateAtSentence(item.lead, featured ? 420 : 220)}</p>
      {item.reasons?.length ? <p className="mt-2 text-xs text-ink-3">★ {item.reasons.join(" · ")}</p> : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="text-xs text-ink-3">
          {item.sourceName.replace(/ \(EBC\) — RSS$/, "")}
          {item.related.length > 0 && ` · +${item.related.length} sobre o mesmo fato`}
        </span>
        <div className="relative z-10 flex items-center gap-1">
          <Link href={`/noticias/${item.id}#entender`} className="rounded-lg px-2.5 py-1 text-sm font-medium text-accent hover:bg-surface-2">
            Entender
          </Link>
          <SaveButton itemType="news" itemId={item.id} saved={saved} next={next} />
        </div>
      </div>
      {showRank && item.rank && (
        <details className="relative z-10 mt-2 text-xs text-ink-3">
          <summary className="cursor-pointer">Por que está aqui?</summary>
          <p className="mt-1">
            Atualidade {item.rank.recency.toFixed(2)} · alcance {item.rank.reach.toFixed(2)} · relevância do tema {item.rank.publicRelevance.toFixed(2)} · texto disponível{" "}
            {item.rank.evidence.toFixed(2)}
            {item.rank.diversityPenalty > 0 && ` · ajuste de diversidade −${item.rank.diversityPenalty.toFixed(2)}`}.{" "}
            <Link href="/metodologia#panorama" className="underline">
              Como ordenamos
            </Link>
          </p>
        </details>
      )}
    </article>
  );
}
