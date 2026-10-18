import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPerson, personNewsMentions, personPropositions, personPropositionStats, personRapporteurships, refreshPersonIfStale, type AuthorRole } from "@/server/queries/person";
import { getCurrentUser } from "@/server/auth";
import { isFollowing } from "@/server/user-data";
import { FollowButton } from "@/components/actions-ui";
import { Assistant } from "@/components/assistant";
import { Badge, Card, EmptyState, Notice, SectionTitle, Tabs } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { db } from "@/server/db/client";
import { topics } from "@/server/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";
type Params = Promise<{ id: string }>;
type SP = Promise<{ papel?: string; tipo?: string; tema?: string; pagina?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const v = await getPerson((await params).id);
  return { title: v?.person.name ?? "Político" };
}

import { AUTHOR_ROLES, ROLE_HELP, ROLE_LABEL } from "@/domain/authorship";
const GROUP_LABEL: Record<string, string> = { norma: "Projetos que podem virar norma", requerimento: "Requerimentos e indicações", emenda_parecer: "Emendas e pareceres", outro: "Outros" };

export default async function PoliticoPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  let view = await getPerson(id);
  if (!view) notFound();
  const refresh = await refreshPersonIfStale(view.person.id, view.camaraId, view.person.detailSyncedAt);
  if (refresh.refreshed) view = (await getPerson(id))!;
  const { person, camaraId, mandates, parties } = view;

  const role = ([...AUTHOR_ROLES, "todas"].includes(sp.papel ?? "") ? sp.papel : "autoria") as AuthorRole | "todas";
  const group = (["norma", "requerimento", "emenda_parecer", "todos"].includes(sp.tipo ?? "") ? sp.tipo : "norma") as "norma" | "requerimento" | "emenda_parecer" | "todos";
  const topicRows = await db.select().from(topics).orderBy(asc(topics.sortOrder));
  const topic = topicRows.find((t) => t.slug === sp.tema);
  const page = Math.max(1, Number(sp.pagina) || 1);
  const [stats, props, rap, news, user] = await Promise.all([
    personPropositionStats(person.id),
    personPropositions(person.id, { role, group, codTemas: topic?.camaraThemeCodes, limit: 20, offset: (page - 1) * 20 }),
    camaraId ? personRapporteurships(camaraId, 10) : Promise.resolve({ total: 0, items: [] }),
    personNewsMentions(person.name, 8),
    getCurrentUser(),
  ]);
  const following = user ? await isFollowing(user.id, { targetType: "person", targetId: person.id }) : false;
  const years = stats.flatMap((s) => [s.minYear, s.maxYear]).filter((y): y is number => !!y);
  const statCount = (r: AuthorRole, g: string) => stats.filter((s) => s.role === r && s.group === g).reduce((a, s) => a + s.count, 0);
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const m = { papel: sp.papel, tipo: sp.tipo, tema: sp.tema, ...patch };
    for (const [k, v] of Object.entries(m)) if (v) q.set(k, v);
    return `/politicos/${person.id}?${q.toString()}#projetos`;
  };
  const current = mandates.find((m) => m.legislature === 57);

  return (
    <article>
      <p className="text-sm text-ink-3"><Link href="/explorar?aba=politicos" className="underline">Políticos</Link> / {person.name}</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        {person.photoUrl && (
          <figure className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={person.photoUrl} alt={`Foto oficial de ${person.name}`} width={120} height={160} className="h-40 w-30 rounded-lg border border-line object-cover" />
            <figcaption className="mt-1 text-xs text-ink-3">Foto: {person.photoSource ?? "fonte não informada"}</figcaption>
          </figure>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl leading-tight sm:text-4xl">{person.name}</h1>
          {person.civilName && <p className="text-sm text-ink-3">Nome civil: {person.civilName}</p>}
          <p className="mt-2 text-ink">
            {current ? `Deputado(a) federal por ${current.uf} — 57ª legislatura (2023–2027)` : mandates[0] ? `Deputado(a) federal por ${mandates[0].uf} na ${mandates[0].legislature}ª legislatura` : "Sem mandato sincronizado"}
          </p>
          <p className="mt-1 text-sm text-ink-2">
            {person.lastKnownParty ? <>Partido mais recente informado pela Câmara: <strong>{person.lastKnownParty}</strong>{person.lastKnownStatusAt ? ` (registro de ${formatDate(person.lastKnownStatusAt)})` : " (lista da legislatura atual)"}</> : "Partido não informado."}
            {person.lastKnownSituation ? ` · ${person.lastKnownSituation}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <FollowButton targetType="person" targetId={person.id} following={following} next={`/politicos/${person.id}`} />
            {camaraId && <a href={`https://www.camara.leg.br/deputados/${camaraId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2">Página na Câmara ↗</a>}
          </div>
          <p className="mt-2 text-xs text-ink-3">ID oficial na Câmara: {camaraId ?? "—"} · dados do perfil atualizados em {formatDateTime(person.detailSyncedAt ?? person.updatedAt)}</p>
        </div>
      </div>

      {refresh.error && <div className="mt-4"><Notice tone="warn">Não foi possível atualizar o perfil agora (Câmara indisponível). Mostrando dados de {formatDateTime(person.detailSyncedAt ?? person.updatedAt)}.</Notice></div>}

      <Notice tone="info" title="Cobertura deste perfil">
        Cargos cobertos: deputado(a) federal (Câmara). Senado, Executivo, mandatos estaduais e municipais ainda não estão integrados (<Link className="underline" href="/cobertura">ver cobertura</Link>).
        Proposições: arquivos anuais da Câmara de 2019 a 2026{person.propositionsSyncedAt ? ` e histórico completo via API (sincronizado em ${formatDate(person.propositionsSyncedAt)})` : "; anos anteriores só para quem é seguido ou sincronizado manualmente"}.
        Votações, despesas, emendas orçamentárias e dados eleitorais ainda não estão integrados. Não há notas ou rankings de “melhor político”.
      </Notice>

      <section aria-labelledby="historico">
        <SectionTitle id="historico">Histórico de mandatos e partidos</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <p className="text-sm font-semibold">Mandatos na Câmara (sincronizados)</p>
            <ul className="mt-2 space-y-1 text-sm">
              {mandates.map((m) => <li key={m.id}>{m.legislature}ª legislatura · {m.uf} · {formatDate(m.startDate)} a {formatDate(m.endDate)}</li>)}
              {mandates.length === 0 && <li className="text-ink-3">Nenhum.</li>}
            </ul>
            <p className="mt-2 text-xs text-ink-3">Estar na lista da legislatura não significa ter exercido o mandato o tempo todo (suplências, licenças).</p>
          </Card>
          <Card>
            <p className="text-sm font-semibold">Partidos por período (registros da Câmara)</p>
            {parties.length === 0 ? <p className="mt-2 text-sm text-ink-3">Histórico partidário ainda não sincronizado.</p> : (
              <ol className="mt-2 space-y-1 text-sm">
                {parties.map((s, i) => <li key={i}><strong>{s.party}</strong> — de {formatDate(s.from)} {s.to ? `a ${formatDate(s.to)}` : "até o registro mais recente"}</li>)}
              </ol>
            )}
            <p className="mt-2 text-xs text-ink-3">Datas dos registros de mudança na Câmara; podem diferir da data formal de filiação.</p>
          </Card>
        </div>
      </section>

      <section aria-labelledby="projetos" id="projetos">
        <SectionTitle id="projetos-titulo">Proposições</SectionTitle>
        <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
          {AUTHOR_ROLES.map((r) => (
            <div key={r} className="rounded-lg bg-surface-2 p-3" title={ROLE_HELP[r]}>
              <p className="text-2xl font-semibold">{statCount(r, "norma").toLocaleString("pt-BR")}</p>
              <p className="text-xs text-ink-3">{ROLE_LABEL[r]}</p>
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-3">Projetos que podem virar norma (PL, PLP, PEC, PDL…). {AUTHOR_ROLES.map((r) => `${ROLE_LABEL[r]}: ${ROLE_HELP[r]}`).join(" ")}</p>
        <p className="mt-2 text-xs text-ink-3">
          Contagens na base do Contexto{years.length ? `, proposições de ${Math.min(...years)} a ${Math.max(...years)}` : ""}. Requerimentos (todos os papéis): {AUTHOR_ROLES.reduce((a, r) => a + statCount(r, "requerimento"), 0).toLocaleString("pt-BR")}; emendas/pareceres: {AUTHOR_ROLES.reduce((a, r) => a + statCount(r, "emenda_parecer"), 0).toLocaleString("pt-BR")}.
          Quantidade de projetos não mede produtividade, qualidade nem impacto.
        </p>
        <div className="mt-4">
          <Tabs current={role} items={([...AUTHOR_ROLES, "todas"] as const).map((r) => ({ key: r, label: r === "todas" ? "Todos os papéis" : ROLE_LABEL[r], href: href({ papel: r, pagina: undefined }) }))} />
        </div>
        <form className="mb-3 flex flex-wrap items-end gap-2 text-sm" action={`/politicos/${person.id}#projetos`}>
          <input type="hidden" name="papel" value={role} />
          <label className="flex flex-col gap-1"><span className="text-ink-3">Tipo</span>
            <select name="tipo" defaultValue={group} className="rounded-lg border border-line bg-surface px-2 py-1.5">
              {Object.entries({ norma: GROUP_LABEL.norma, requerimento: GROUP_LABEL.requerimento, emenda_parecer: GROUP_LABEL.emenda_parecer, todos: "Todos" }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="text-ink-3">Tema (classificação da Câmara)</span>
            <select name="tema" defaultValue={sp.tema ?? ""} className="rounded-lg border border-line bg-surface px-2 py-1.5">
              <option value="">Todos</option>
              {topicRows.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select>
          </label>
          <button className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink">Filtrar</button>
        </form>
        <p className="mb-2 text-sm text-ink-2">{props.total.toLocaleString("pt-BR")} resultado(s) com estes filtros{topic ? ` · tema ${topic.name}` : ""}.</p>
        {props.items.length === 0 ? <EmptyState title="Nenhuma proposição com estes filtros na base atual">Isso não significa que não existam: verifique a cobertura acima.</EmptyState> : (
          <ul className="space-y-2">
            {props.items.map((x) => (
              <li key={x.id}>
                <Card>
                  <p className="text-xs text-ink-3">{formatDate(x.presentedAt)} · <Badge>{ROLE_LABEL[x.role]}</Badge></p>
                  <p className="mt-1"><Link href={`/projetos/${x.id}`} className="font-semibold underline">{x.siglaTipo} {x.numero}/{x.ano}</Link> — {x.ementa.length > 260 ? `${x.ementa.slice(0, 260)}…` : x.ementa}</p>
                  {x.statusSituacao && <p className="mt-1 text-xs text-ink-3">Situação: {x.statusSituacao}</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex gap-2 text-sm">
          {page > 1 && <Link className="underline" href={href({ pagina: String(page - 1) })}>← Anterior</Link>}
          {page * 20 < props.total && <Link className="underline" href={href({ pagina: String(page + 1) })}>Próxima →</Link>}
        </div>
      </section>

      <section aria-labelledby="relatorias">
        <SectionTitle id="relatorias">Relatorias</SectionTitle>
        <p className="mb-2 text-xs text-ink-3">Proposições em que esta pessoa é o último relator registrado ({rap.total}). Não inclui relatorias anteriores substituídas. Relatoria é separada de autoria.</p>
        {rap.items.length === 0 ? <p className="text-sm text-ink-2">Nenhuma na base atual.</p> : (
          <ul className="space-y-1 text-sm">
            {rap.items.map((r) => <li key={r.id}><Link className="underline" href={`/projetos/${r.id}`}>{r.sigla_tipo} {r.numero}/{r.ano}</Link> — {r.ementa.slice(0, 140)} <span className="text-ink-3">({r.status_orgao ?? "—"}, {formatDate(r.statusAt)})</span></li>)}
          </ul>
        )}
      </section>

      <section aria-labelledby="noticias">
        <SectionTitle id="noticias">Notícias que mencionam o nome</SectionTitle>
        <p className="mb-2 text-xs text-ink-3">Correspondência pelo nome “{person.name}” no título ou trecho. Pode incluir homônimos e não comprova nada sobre a pessoa.</p>
        {news.length === 0 ? <p className="text-sm text-ink-2">Nenhuma menção nas notícias coletadas.</p> : (
          <ul className="space-y-1 text-sm">{news.map((n) => <li key={n.id}><Link className="underline" href={`/noticias/${n.id}`}>{n.title}</Link> <span className="text-ink-3">({formatDate(n.publishedAt)})</span></li>)}</ul>
        )}
      </section>

      <div className="mt-8">
        <Assistant context={{ type: "person", id: person.id }} title={`Perguntar sobre ${person.name}`} suggestions={["Quais projetos apresentou sobre saúde?", "Quais projetos apresentou sobre educação?", "Como votou nas últimas votações?"]} />
      </div>
    </article>
  );
}
