import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { topics } from "@/server/db/schema";
import { getFeed, getInterestFeed, lastRun, type NewsCard as NewsCardData } from "@/server/queries/news";
import { congressHighlights } from "@/server/queries/proposition";
import { getCurrentUser } from "@/server/auth";
import { getPreferences, listFollows, savedIdSet } from "@/server/user-data";
import { personsByIds } from "@/server/queries/person";
import { NewsCard } from "@/components/news-card";
import { PropositionGrid } from "@/components/proposition-card";
import { AboutData, ChipNav, EmptyState, Notice, TopicIcon } from "@/components/ui";
import { formatDate, formatDateTime, formatLongDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = Promise<{ periodo?: string; tema?: string; ordem?: string; conta?: string }>;

const PERIODS = [
  { key: "", label: "Últimas 48h", hours: 48 },
  { key: "168", label: "7 dias", hours: 168 },
];

export default async function HojePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const period = PERIODS.find((p) => p.key === (sp.periodo ?? "")) ?? PERIODS[0];
  const sort = sp.ordem === "recentes" ? "cronologica" : "panorama";
  const user = await getCurrentUser();
  const [topicRows, prefs, follows, run, congress] = await Promise.all([
    db.select().from(topics).orderBy(asc(topics.sortOrder)),
    user ? getPreferences(user.id) : Promise.resolve(null),
    user ? listFollows(user.id) : Promise.resolve([]),
    lastRun("agencia-brasil:rss"),
    congressHighlights(21, 4),
  ]);
  const activeTopic = topicRows.find((t) => t.slug === sp.tema);
  const topicFilter = activeTopic ? [activeTopic.slug] : prefs?.categories.length ? prefs.categories : undefined;
  const feed = await getFeed({ sinceHours: period.hours, topicSlugs: topicFilter, sort, limit: 25 });

  let interest: NewsCardData[] = [];
  if (user && !activeTopic) {
    const followedTopics = follows.filter((f) => f.targetType === "topic").map((f) => f.targetId);
    const people = await personsByIds(follows.filter((f) => f.targetType === "person").map((f) => f.targetId));
    interest = await getInterestFeed({ topicSlugs: followedTopics, personNames: people.map((p) => ({ id: p.id, name: p.name })) }, { sinceHours: period.hours });
  }
  const saved = user ? await savedIdSet(user.id, "news", [...feed, ...interest].map((n) => n.id)) : new Set<string>();
  const stale = !run?.finishedAt || Date.now() - run.finishedAt.getTime() > 3 * 3600_000;

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ periodo: sp.periodo, tema: sp.tema, ordem: sp.ordem, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
  const next = href({});
  const [hero, ...rest] = feed;

  return (
    <>
      <header className="mb-5">
        <p className="text-sm text-ink-3 first-letter:uppercase">{formatLongDate(new Date())}</p>
        <h1 className="mt-1 font-serif text-4xl leading-tight sm:text-5xl">Hoje</h1>
        <p className="mt-1 text-ink-2">O que aconteceu, explicado e com a fonte.</p>
      </header>

      {sp.conta === "excluida" && <div className="mb-4"><Notice tone="ok">Sua conta e seus dados foram excluídos.</Notice></div>}
      {(run?.status === "failed" || stale) && (
        <div className="mb-4">
          <Notice tone="warn">Notícias podem estar desatualizadas — última coleta: {formatDateTime(run?.finishedAt ?? null)}.</Notice>
        </div>
      )}

      <ChipNav
        label="Temas"
        items={[
          { key: "", label: prefs?.categories.length ? "Meus temas" : "Tudo", href: href({ tema: undefined }), active: !activeTopic },
          ...topicRows
            .filter((t) => t.newsCategories.length > 0)
            .map((t) => ({ key: t.slug, label: <><TopicIcon slug={t.slug} /> {t.name}</>, href: href({ tema: t.slug }), active: activeTopic?.slug === t.slug })),
        ]}
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="flex gap-1 rounded-full bg-surface-2 p-1">
          {[
            { k: undefined, l: "Destaques" },
            { k: "recentes", l: "Mais recentes" },
          ].map((o) => (
            <Link key={o.l} href={href({ ordem: o.k })} aria-current={(sp.ordem === "recentes") === (o.k === "recentes") ? "true" : undefined}
              className={`rounded-full px-3 py-1 ${(sp.ordem === "recentes") === (o.k === "recentes") ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2"}`}>
              {o.l}
            </Link>
          ))}
        </span>
        <span className="flex gap-3 text-ink-2">
          {PERIODS.map((p) => (
            <Link key={p.key} href={href({ periodo: p.key || undefined })} className={p === period ? "font-semibold text-ink underline underline-offset-4" : "hover:text-ink"}>
              {p.label}
            </Link>
          ))}
        </span>
      </div>

      {interest.length > 0 && (
        <section aria-labelledby="interesses" className="mt-8">
          <h2 id="interesses" className="mb-3 font-serif text-2xl">Para você</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {interest.slice(0, 4).map((n) => <NewsCard key={n.id} item={n} saved={saved.has(n.id)} next={next} />)}
          </div>
        </section>
      )}

      <section aria-labelledby="panorama" className="mt-8">
        <h2 id="panorama" className="sr-only">Panorama</h2>
        {!hero ? (
          <EmptyState title="Nada por aqui neste período">Tente “7 dias” ou outro tema.</EmptyState>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <NewsCard item={hero} saved={saved.has(hero.id)} next={next} showRank={sort === "panorama"} featured />
            </div>
            {rest.slice(0, 7).map((n) => <NewsCard key={n.id} item={n} saved={saved.has(n.id)} next={next} showRank={sort === "panorama"} />)}
          </div>
        )}
      </section>

      {congress.length > 0 && (
        <section aria-labelledby="congresso" className="mt-12">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="congresso" className="font-serif text-2xl">🏛️ No Congresso</h2>
            <Link href="/explorar?aba=projetos" className="text-sm text-ink-2 hover:underline">Explorar projetos →</Link>
          </div>
          <p className="mb-4 text-sm text-ink-3">Projetos que viraram lei, foram aprovados ou mudaram de Casa nas últimas semanas.</p>
          <PropositionGrid items={congress.map((c) => ({ ...c, footer: c.statusAt ? `Atualizado em ${formatDate(c.statusAt)}` : undefined }))} />
        </section>
      )}

      {rest.length > 7 && (
        <section aria-labelledby="mais" className="mt-12">
          <h2 id="mais" className="mb-3 font-serif text-2xl">Mais notícias</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {rest.slice(7).map((n) => <NewsCard key={n.id} item={n} saved={saved.has(n.id)} next={next} showRank={sort === "panorama"} />)}
          </div>
        </section>
      )}

      <div className="mt-10">
        <AboutData title="Como esta página é montada">
          <p>“Destaques” ordena por atualidade, alcance do acontecimento, relevância pública do tema e texto disponível, com ajuste para variar os temas. É uma escolha editorial do Imparciali, igual para todas as pessoas — não usa seus cliques nem seu posicionamento. <Link href="/metodologia#panorama" className="underline">Ver a fórmula</Link>.</p>
          <p>Notícias: Agência Brasil (apenas o trecho inicial; leia a matéria completa no original). Ciência e tecnologia ainda não têm fonte de notícias integrada.</p>
        </AboutData>
      </div>
    </>
  );
}
