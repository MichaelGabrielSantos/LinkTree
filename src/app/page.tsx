import Link from "next/link";
import { db } from "@/server/db/client";
import { topics } from "@/server/db/schema";
import { asc } from "drizzle-orm";
import { getFeed, getInterestFeed, lastRun, type NewsCard as NewsCardData } from "@/server/queries/news";
import { getCurrentUser } from "@/server/auth";
import { getPreferences, listFollows, savedIdSet } from "@/server/user-data";
import { personsByIds } from "@/server/queries/person";
import { NewsCard } from "@/components/news-card";
import { EmptyState, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { formatDateTime, formatLongDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const PERIODS = [
  { key: "24", label: "24 horas" },
  { key: "72", label: "3 dias" },
  { key: "168", label: "7 dias" },
];

type SP = Promise<{ periodo?: string; tema?: string; fonte?: string; ordem?: string; conta?: string }>;

export default async function HojePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const sinceHours = PERIODS.some((p) => p.key === sp.periodo) ? Number(sp.periodo) : 48;
  const sort = sp.ordem === "cronologica" ? "cronologica" : "panorama";
  const user = await getCurrentUser();
  const [topicRows, prefs, follows, run] = await Promise.all([
    db.select().from(topics).orderBy(asc(topics.sortOrder)),
    user ? getPreferences(user.id) : Promise.resolve(null),
    user ? listFollows(user.id) : Promise.resolve([]),
    lastRun("agencia-brasil:rss"),
  ]);
  const topicFilter = sp.tema && topicRows.some((t) => t.slug === sp.tema) ? [sp.tema] : prefs?.categories.length ? prefs.categories : undefined;
  const feed = await getFeed({ sinceHours, topicSlugs: topicFilter, sourceId: sp.fonte, sort, limit: 30 });

  let interest: NewsCardData[] = [];
  if (user) {
    const followedTopics = follows.filter((f) => f.targetType === "topic").map((f) => f.targetId);
    const people = await personsByIds(follows.filter((f) => f.targetType === "person").map((f) => f.targetId));
    interest = await getInterestFeed({ topicSlugs: followedTopics, personNames: people.map((p) => ({ id: p.id, name: p.name })) }, { sinceHours });
  }
  const saved = user ? await savedIdSet(user.id, "news", [...feed, ...interest].map((n) => n.id)) : new Set<string>();

  const stale = !run?.finishedAt || Date.now() - run.finishedAt.getTime() > 3 * 3600_000;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { periodo: sp.periodo, tema: sp.tema, fonte: sp.fonte, ordem: sp.ordem, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
  const next = qs({});

  return (
    <>
      <PageHeader eyebrow={formatLongDate(new Date())} title="Hoje">
        O que aconteceu, com a fonte de cada informação.
      </PageHeader>

      {sp.conta === "excluida" && <Notice tone="ok">Sua conta e seus dados foram excluídos.</Notice>}
      {run?.status === "failed" && (
        <Notice tone="warn" title="A última atualização de notícias falhou">
          Mostrando o que já tínhamos. Última tentativa em {formatDateTime(run.startedAt)}.
        </Notice>
      )}
      {stale && run?.status !== "failed" && (
        <Notice tone="warn">Notícias podem estar desatualizadas: última coleta em {formatDateTime(run?.finishedAt ?? null)}.</Notice>
      )}

      <form className="mt-4 grid grid-cols-2 items-end gap-3 rounded-xl border border-line bg-surface p-3 text-sm sm:flex sm:flex-wrap" aria-label="Filtros do panorama">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-ink-3">Período</span>
          <select name="periodo" defaultValue={sp.periodo ?? ""} className="w-full min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 sm:w-auto">
            <option value="">48 horas</option>
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-ink-3">Tema</span>
          <select name="tema" defaultValue={sp.tema ?? ""} className="w-full min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 sm:w-auto">
            <option value="">{prefs?.categories.length ? "Meus temas (preferências)" : "Todos"}</option>
            {topicRows.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
                {t.newsCategories.length === 0 ? " (sem fonte)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-ink-3">Fonte</span>
          <select name="fonte" defaultValue={sp.fonte ?? ""} className="w-full min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 sm:w-auto">
            <option value="">Todas</option>
            <option value="agencia-brasil">Agência Brasil</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-ink-3">Ordem</span>
          <select name="ordem" defaultValue={sort} className="w-full min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 sm:w-auto">
            <option value="panorama">Panorama (critério do produto)</option>
            <option value="cronologica">Mais recentes primeiro</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink">Aplicar</button>
      </form>

      {user && (
        <section aria-labelledby="interesses">
          <SectionTitle id="interesses" aside={<Link href="/acompanhando" className="underline">Gerenciar</Link>}>
            Seus interesses
          </SectionTitle>
          {interest.length === 0 ? (
            <EmptyState title="Nada novo nos seus interesses neste período">
              Siga temas e políticos para ver aqui o que tem relação com eles. Você também pode <Link className="underline" href="/explorar">explorar</Link>.
            </EmptyState>
          ) : (
            <div className="grid gap-3">
              {interest.slice(0, 6).map((n) => (
                <NewsCard key={n.id} item={n} saved={saved.has(n.id)} next={next} />
              ))}
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="panorama">
        <SectionTitle
          id="panorama"
          aside={
            <Link href="/metodologia#panorama" className="underline">
              {sort === "panorama" ? "Como ordenamos" : "Ordem cronológica"}
            </Link>
          }
        >
          Panorama geral
        </SectionTitle>
        <p className="-mt-2 mb-3 text-xs text-ink-3">
          {sort === "panorama"
            ? "Ordenado por atualidade, alcance, relevância pública do tema, evidência disponível e diversidade temática. Igual para todas as pessoas; não usa seus cliques nem posicionamento."
            : "Matérias mais recentes primeiro."}{" "}
          Fonte atual: Agência Brasil (apenas trechos). Ciência e tecnologia ainda não têm fonte de notícias integrada.
        </p>
        {feed.length === 0 ? (
          <EmptyState title="Nenhuma matéria neste período ou filtro">
            Tente ampliar o período. {topicFilter && !sp.tema ? "Você está vendo só os temas das suas preferências." : null}
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            {feed.map((n) => (
              <NewsCard key={n.id} item={n} saved={saved.has(n.id)} next={next} showRank={sort === "panorama"} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="explorar-cta" className="mt-10">
        <h2 id="explorar-cta" className="font-serif text-xl">Quer entender um assunto?</h2>
        <p className="mt-1 text-sm text-ink-2">Pesquise políticos, projetos e notícias, ou faça uma pergunta.</p>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {["Qual é a diferença entre apresentar um projeto e aprovar uma lei?", "projetos sobre proteção de crianças nas redes sociais", "eleições"].map((q) => (
            <li key={q}>
              <Link href={`/explorar?q=${encodeURIComponent(q)}`} className="inline-block rounded-full border border-line px-3 py-1 hover:bg-surface-2">
                {q}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
