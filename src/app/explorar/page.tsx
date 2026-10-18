import Link from "next/link";
import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { topics } from "@/server/db/schema";
import { needsDisambiguation, searchNews, searchPersons, searchPropositions, type PersonHit } from "@/server/queries/search";
import { Assistant } from "@/components/assistant";
import { Badge, Card, EmptyState, Notice, PageHeader, SectionTitle, Tabs } from "@/components/ui";
import { formatDate, relativeTime } from "@/lib/format";
import { truncateAtSentence } from "@/lib/text";

export const metadata: Metadata = { title: "Explorar" };
export const dynamic = "force-dynamic";

type SP = Promise<{ q?: string; aba?: string; tipo?: string; ano?: string; tema?: string; periodo?: string }>;

const isQuestion = (q: string) => /\?\s*$/.test(q) || /^(o que|qual|quais|como|por que|porque|quem|quando|onde|explique|existe|há|ha)\b/i.test(q.trim());

function PersonRow({ p }: { p: PersonHit }) {
  return (
    <li>
      <Card>
        <div className="flex items-center gap-3">
          {p.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt="" width={48} height={64} className="h-16 w-12 rounded border border-line object-cover" />
          )}
          <div className="min-w-0">
            <Link href={`/politicos/${p.id}`} className="font-semibold underline">{p.name}</Link>
            <p className="text-xs text-ink-3">
              {p.mandates.length ? p.mandates.map((m) => `Deputado(a) federal · ${m.uf} · ${m.legislature}ª leg. (${m.startDate?.slice(0, 4)}–${m.endDate?.slice(0, 4)})`).join(" | ") : "Sem mandato sincronizado"}
            </p>
            <p className="text-xs text-ink-3">{p.lastKnownParty ? `Último partido informado: ${p.lastKnownParty}` : "Partido não informado"} · ID Câmara {p.camaraId ?? "—"}</p>
          </div>
        </div>
      </Card>
    </li>
  );
}

export default async function ExplorarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 300);
  const aba = ["tudo", "noticias", "politicos", "projetos"].includes(sp.aba ?? "") ? sp.aba! : "tudo";
  const topicRows = await db.select().from(topics).orderBy(asc(topics.sortOrder));
  const tema = topicRows.find((t) => t.slug === sp.tema);
  const tipo = (["norma", "requerimento", "emenda_parecer", "todos"].includes(sp.tipo ?? "") ? sp.tipo : "norma") as "norma" | "requerimento" | "emenda_parecer" | "todos";
  const ano = /^\d{4}$/.test(sp.ano ?? "") ? Number(sp.ano) : undefined;
  const periodo = ["24", "168", "720"].includes(sp.periodo ?? "") ? Number(sp.periodo) : undefined;

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const m = { q, aba, tipo: sp.tipo, ano: sp.ano, tema: sp.tema, periodo: sp.periodo, ...patch };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, v);
    return `/explorar?${p.toString()}`;
  };

  if (!q) {
    return (
      <>
        <PageHeader title="Explorar">Pesquise notícias, políticos e projetos — ou faça uma pergunta em linguagem natural.</PageHeader>
        <form action="/explorar" role="search" className="flex gap-2">
          <label htmlFor="q" className="sr-only">Pesquisa</label>
          <input id="q" name="q" type="search" placeholder="Ex.: Tabata Amaral, PL 5498/2026, reforma tributária…" className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2" />
          <button className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink">Pesquisar</button>
        </form>
        <SectionTitle>Temas</SectionTitle>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {topicRows.map((t) => (
            <li key={t.slug}>
              <Link href={`/temas/${t.slug}`} className="block rounded-lg border border-line bg-surface p-3 hover:bg-surface-2">
                <span className="font-semibold">{t.name}</span>
                <span className="mt-0.5 block text-xs text-ink-3">{t.description}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <Assistant
            context={null}
            title="Perguntar"
            suggestions={[
              "O que aconteceu hoje na economia?",
              "Qual é a diferença entre apresentar um projeto e aprovar uma lei?",
              "Quais projetos Tabata Amaral apresentou sobre educação?",
            ]}
          />
        </div>
      </>
    );
  }

  const [persons, props, news] = await Promise.all([
    aba === "tudo" || aba === "politicos" ? searchPersons(q, aba === "tudo" ? 5 : 20) : Promise.resolve([]),
    aba === "tudo" || aba === "projetos" ? searchPropositions(q, { group: tipo, ano, matchAny: isQuestion(q) }, aba === "tudo" ? 5 : 30) : Promise.resolve([]),
    aba === "tudo" || aba === "noticias" ? searchNews(q, { topicSlug: tema?.slug, sinceHours: periodo, matchAny: isQuestion(q) }, aba === "tudo" ? 5 : 30) : Promise.resolve([]),
  ]);
  const ambiguous = needsDisambiguation(persons);

  return (
    <>
      <PageHeader eyebrow="Resultados para" title={`“${q}”`} />
      <form action="/explorar" role="search" className="mb-4 flex gap-2">
        <label htmlFor="q2" className="sr-only">Pesquisa</label>
        <input id="q2" name="q" defaultValue={q} type="search" className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2" />
        <input type="hidden" name="aba" value={aba} />
        <button className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink">Pesquisar</button>
      </form>
      <Tabs
        current={aba}
        items={[
          { key: "tudo", label: "Tudo", href: href({ aba: "tudo" }) },
          { key: "noticias", label: "Notícias", href: href({ aba: "noticias" }) },
          { key: "politicos", label: "Políticos", href: href({ aba: "politicos" }) },
          { key: "projetos", label: "Projetos", href: href({ aba: "projetos" }) },
        ]}
      />

      {aba === "noticias" && (
        <form className="mb-4 flex flex-wrap items-end gap-2 text-sm" action="/explorar">
          <input type="hidden" name="q" value={q} /><input type="hidden" name="aba" value="noticias" />
          <label className="flex flex-col gap-1"><span className="text-ink-3">Tema</span>
            <select name="tema" defaultValue={sp.tema ?? ""} className="rounded-lg border border-line bg-surface px-2 py-1.5">
              <option value="">Todos</option>{topicRows.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-ink-3">Período</span>
            <select name="periodo" defaultValue={sp.periodo ?? ""} className="rounded-lg border border-line bg-surface px-2 py-1.5">
              <option value="">Todo o arquivo</option><option value="24">24 horas</option><option value="168">7 dias</option><option value="720">30 dias</option>
            </select></label>
          <button className="rounded-lg border border-line px-3 py-1.5">Filtrar</button>
        </form>
      )}
      {aba === "projetos" && (
        <form className="mb-4 flex flex-wrap items-end gap-2 text-sm" action="/explorar">
          <input type="hidden" name="q" value={q} /><input type="hidden" name="aba" value="projetos" />
          <label className="flex flex-col gap-1"><span className="text-ink-3">Tipo</span>
            <select name="tipo" defaultValue={tipo} className="rounded-lg border border-line bg-surface px-2 py-1.5">
              <option value="norma">Projetos que podem virar norma</option><option value="requerimento">Requerimentos</option><option value="emenda_parecer">Emendas e pareceres</option><option value="todos">Todos</option>
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-ink-3">Ano</span>
            <input name="ano" defaultValue={sp.ano ?? ""} inputMode="numeric" pattern="\d{4}" placeholder="AAAA" className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5" /></label>
          <button className="rounded-lg border border-line px-3 py-1.5">Filtrar</button>
        </form>
      )}

      {aba === "tudo" && isQuestion(q) && (
        <div className="mb-6">
          <Assistant context={null} initialQuestion={q} autoRun title="Resposta com fontes" />
        </div>
      )}

      {(aba === "tudo" || aba === "politicos") && (
        <section aria-labelledby="r-pol">
          <SectionTitle id="r-pol" aside={aba === "tudo" && persons.length ? <Link className="underline" href={href({ aba: "politicos" })}>ver todos</Link> : undefined}>Políticos</SectionTitle>
          {ambiguous && <div className="mb-2"><Notice tone="info">Há mais de uma pessoa com nome parecido. Confira cargo, UF e período antes de abrir o perfil.</Notice></div>}
          {persons.length === 0 ? <p className="text-sm text-ink-2">Nenhum deputado federal encontrado com esse nome. Senado e outros cargos ainda não estão cobertos (<Link className="underline" href="/cobertura">cobertura</Link>).</p> : (
            <ul className="grid gap-2 sm:grid-cols-2">{persons.map((p) => <PersonRow key={p.id} p={p} />)}</ul>
          )}
        </section>
      )}

      {(aba === "tudo" || aba === "projetos") && (
        <section aria-labelledby="r-proj">
          <SectionTitle id="r-proj" aside={aba === "tudo" && props.length ? <Link className="underline" href={href({ aba: "projetos" })}>ver todos</Link> : undefined}>Projetos</SectionTitle>
          {props.length === 0 ? <p className="text-sm text-ink-2">Nenhuma proposição encontrada na base (Câmara, 2019–2026 e sincronizações). Isso não significa que não exista.</p> : (
            <ul className="space-y-2">
              {props.map((p) => (
                <li key={p.id}>
                  <Card>
                    <p className="text-xs text-ink-3">{formatDate(p.presentedAt)}{p.statusSituacao ? ` · ${p.statusSituacao}` : ""}</p>
                    <p className="mt-1"><Link href={`/projetos/${p.id}`} className="font-semibold underline">{p.siglaTipo} {p.numero}/{p.ano}</Link> — {truncateAtSentence(p.ementa, 260)}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(aba === "tudo" || aba === "noticias") && (
        <section aria-labelledby="r-not">
          <SectionTitle id="r-not" aside={aba === "tudo" && news.length ? <Link className="underline" href={href({ aba: "noticias" })}>ver todas</Link> : undefined}>Notícias</SectionTitle>
          {news.length === 0 ? <p className="text-sm text-ink-2">Nenhuma notícia encontrada nas matérias coletadas (Agência Brasil).</p> : (
            <ul className="space-y-2">
              {news.map((n) => (
                <li key={n.id}>
                  <Card>
                    <p className="text-xs text-ink-3">{relativeTime(n.publishedAt)} · Agência Brasil {n.topicSlug && <Badge>{topicRows.find((t) => t.slug === n.topicSlug)?.name}</Badge>}</p>
                    <p className="mt-1"><Link href={`/noticias/${n.id}`} className="font-semibold underline">{n.title}</Link></p>
                    <p className="mt-1 text-sm text-ink-2">{truncateAtSentence(n.lead, 200)}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {aba === "tudo" && !isQuestion(q) && (
        <div className="mt-8">
          <Assistant context={null} initialQuestion={q} title="Perguntar sobre isso" />
        </div>
      )}
    </>
  );
}
