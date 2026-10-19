import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { getPerson, personNewsMentions, personPropositions, personPropositionStats, personRapporteurships, refreshPersonIfStale } from "@/server/queries/person";
import { ceapSummary, ceapYearTotal, declaredAssetsSummary } from "@/server/queries/finance";
import { getCurrentUser } from "@/server/auth";
import { isFollowing } from "@/server/user-data";
import { db } from "@/server/db/client";
import { topics } from "@/server/db/schema";
import { FollowButton } from "@/components/actions-ui";
import { Assistant } from "@/components/assistant";
import { PropositionGrid } from "@/components/proposition-card";
import { BarList, ColumnChart } from "@/components/charts";
import { AboutData, Card, ChipNav, EmptyState, Notice, StatTile, Tabs, TopicIcon } from "@/components/ui";
import { AUTHOR_ROLES, ROLE_HELP, ROLE_LABEL, type AuthorRole } from "@/domain/authorship";
import { formatBRL, formatBRLCompact, formatDate, formatDateTime, MONTHS_SHORT } from "@/lib/format";

export const dynamic = "force-dynamic";
type Params = Promise<{ id: string }>;
type SP = Promise<{ aba?: string; papel?: string; tipo?: string; tema?: string; pagina?: string; ano?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const v = await getPerson((await params).id);
  return { title: v?.person.name ?? "Político" };
}

const TABS = [
  { key: "visao", label: "Visão geral" },
  { key: "projetos", label: "Projetos" },
  { key: "gastos", label: "Gastos" },
  { key: "patrimonio", label: "Patrimônio" },
  { key: "noticias", label: "Notícias" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function PoliticoPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  let view = await getPerson(id);
  if (!view) notFound();
  const refresh = await refreshPersonIfStale(view.person.id, view.camaraId, view.person.detailSyncedAt);
  if (refresh.refreshed) view = (await getPerson(id))!;
  const { person, camaraId, mandates, parties } = view;
  const tab: TabKey = TABS.some((t) => t.key === sp.aba) ? (sp.aba as TabKey) : "visao";
  const user = await getCurrentUser();
  const following = user ? await isFollowing(user.id, { targetType: "person", targetId: person.id }) : false;
  const current = mandates.find((m) => m.legislature === 57);
  const base = `/politicos/${person.id}`;
  const tabHref = (k: string, extra: Record<string, string | undefined> = {}) => {
    const q = new URLSearchParams();
    if (k !== "visao") q.set("aba", k);
    for (const [kk, v] of Object.entries(extra)) if (v) q.set(kk, v);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <article>
      <p className="text-sm text-ink-3"><Link href="/explorar?aba=politicos" className="hover:underline">← Políticos</Link></p>

      <header className="mt-3 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:p-6">
        {person.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.photoUrl} alt={`Foto oficial de ${person.name} (Câmara dos Deputados)`} width={96} height={128} className="h-28 w-21 shrink-0 rounded-xl object-cover sm:h-32 sm:w-24" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl leading-tight sm:text-4xl">{person.name}</h1>
          <p className="mt-1 text-ink-2">
            {current ? `Deputado(a) federal · ${current.uf}` : mandates[0] ? `Ex-deputado(a) federal · ${mandates[0].uf}` : "Sem mandato sincronizado"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {person.lastKnownParty && <span className="rounded-full bg-surface-2 px-3 py-0.5 font-medium">{person.lastKnownParty}</span>}
            {current && <span className="rounded-full bg-surface-2 px-3 py-0.5">Mandato 2023–2027</span>}
            {person.lastKnownSituation && <span className="rounded-full bg-surface-2 px-3 py-0.5 text-ink-2">{person.lastKnownSituation}</span>}
          </div>
        </div>
        <div className="flex gap-2 sm:flex-col">
          <FollowButton targetType="person" targetId={person.id} following={following} next={base} />
          {camaraId && (
            <a href={`https://www.camara.leg.br/deputados/${camaraId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2">
              Página oficial ↗
            </a>
          )}
        </div>
      </header>

      {refresh.error && <div className="mt-3"><Notice tone="warn">Não conseguimos atualizar o perfil agora. Mostrando dados de {formatDateTime(person.detailSyncedAt ?? person.updatedAt)}.</Notice></div>}

      <div className="mt-6">
        <Tabs current={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: tabHref(t.key) }))} />
      </div>

      {tab === "visao" && <Overview personId={person.id} camaraId={camaraId} tabHref={tabHref} parties={parties} mandates={mandates} />}
      {tab === "projetos" && <Projects personId={person.id} camaraId={camaraId} sp={sp} tabHref={tabHref} />}
      {tab === "gastos" && <Spending personId={person.id} year={Number(sp.ano) || undefined} tabHref={tabHref} camaraId={camaraId} />}
      {tab === "patrimonio" && <Assets personId={person.id} />}
      {tab === "noticias" && <News name={person.name} />}

      <div className="mt-10">
        <Assistant
          context={{ type: "person", id: person.id }}
          title={`Pergunte sobre ${person.name}`}
          suggestions={["Quais projetos apresentou sobre saúde?", "Quais projetos apresentou sobre educação?", "Quais projetos viraram lei?"]}
        />
      </div>

      <div className="mt-6">
        <AboutData title="Sobre os dados deste perfil">
          <p>ID oficial na Câmara: {camaraId ?? "—"}. Perfil atualizado em {formatDateTime(person.detailSyncedAt ?? person.updatedAt)}.</p>
          <p>Cobertura: deputados federais (Câmara). Senado, Executivo e mandatos estaduais/municipais ainda não estão integrados (<Link className="underline" href="/cobertura">ver cobertura</Link>). Votações e emendas orçamentárias ainda não estão integradas.</p>
          <p>Não damos notas nem rankings de “melhor político”. Quantidade de projetos ou de gastos não mede qualidade do mandato.</p>
        </AboutData>
      </div>
    </article>
  );
}

async function Overview({ personId, camaraId, tabHref, parties, mandates }: {
  personId: string; camaraId: string | null; tabHref: (k: string, e?: Record<string, string | undefined>) => string;
  parties: Array<{ party: string; from: Date; to: Date | null }>; mandates: Array<{ id: number; legislature: number; uf: string; startDate: string | null; endDate: string | null }>;
}) {
  const [stats, recent, laws, spend, assets] = await Promise.all([
    personPropositionStats(personId),
    personPropositions(personId, { role: "autoria", group: "norma", limit: 4 }),
    personPropositions(personId, { role: "todas", group: "norma", limit: 4, onlyLaw: true }),
    ceapYearTotal(personId),
    declaredAssetsSummary(personId),
  ]);
  const authored = stats.filter((s) => s.group === "norma" && (s.role === "autoria" || s.role === "coautoria")).reduce((a, s) => a + s.count, 0);
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
        <StatTile label="Projetos de lei e PECs" value={authored.toLocaleString("pt-BR")} hint="como autor(a) ou coautor(a), desde 2019" href={tabHref("projetos")} />
        <StatTile label={`Cota parlamentar ${spend?.year ?? ""}`} value={spend ? formatBRLCompact(spend.total) : "—"} hint="gastos reembolsados pela Câmara" href={tabHref("gastos")} />
        <StatTile label={`Patrimônio declarado ${assets?.electionYear ?? ""}`} value={assets ? formatBRLCompact(assets.total) : "—"} hint={assets ? "segundo declaração ao TSE" : "sem declaração vinculada"} href={tabHref("patrimonio")} />
      </div>

      {laws.items.length > 0 && (
        <section>
          <h2 className="mb-3 font-serif text-xl">✓ Projetos que viraram norma</h2>
          <PropositionGrid items={laws.items} />
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-serif text-xl">Projetos recentes</h2>
          <Link href={tabHref("projetos")} className="text-sm text-ink-2 hover:underline">Ver todos →</Link>
        </div>
        {recent.items.length ? <PropositionGrid items={recent.items} /> : <EmptyState title="Nenhum projeto como 1º signatário na base" />}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h2 className="font-serif text-lg">Partidos ao longo do tempo</h2>
          {parties.length === 0 ? <p className="mt-2 text-sm text-ink-3">Histórico ainda não sincronizado.</p> : (
            <ol className="mt-3 space-y-2">
              {[...parties].reverse().map((s, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${i === 0 ? "bg-chart-1" : "bg-chart-track"}`} aria-hidden />
                  <span className="font-semibold">{s.party}</span>
                  <span className="text-ink-3">{formatDate(s.from).slice(3)} → {s.to ? formatDate(s.to).slice(3) : "hoje"}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card>
          <h2 className="font-serif text-lg">Mandatos na Câmara</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {mandates.map((m) => <li key={m.id}><span className="font-semibold">{m.startDate?.slice(0, 4)}–{m.endDate?.slice(0, 4)}</span> <span className="text-ink-3">· {m.uf} · {m.legislature}ª legislatura</span></li>)}
          </ul>
        </Card>
      </section>
      {camaraId && <RapporteurList camaraId={camaraId} />}
    </div>
  );
}

async function RapporteurList({ camaraId }: { camaraId: string }) {
  const rap = await personRapporteurships(camaraId, 4);
  if (!rap.items.length) return null;
  return (
    <section>
      <h2 className="mb-1 font-serif text-xl">Relatorias atuais</h2>
      <p className="mb-3 text-sm text-ink-3">Projetos em que é a pessoa relatora mais recente ({rap.total}). Relatar é analisar e dar parecer — diferente de ser autor.</p>
      <PropositionGrid
        items={rap.items.map((r) => ({ id: r.id, siglaTipo: r.sigla_tipo, numero: r.numero, ano: r.ano, ementa: r.ementa, presentedAt: null, statusSituacao: r.status_situacao, footer: r.status_orgao ? `Em ${r.status_orgao}` : undefined }))}
      />
    </section>
  );
}

async function Projects({ personId, sp, tabHref }: { personId: string; camaraId: string | null; sp: Awaited<SP>; tabHref: (k: string, e?: Record<string, string | undefined>) => string }) {
  const role = ([...AUTHOR_ROLES, "todas"] as string[]).includes(sp.papel ?? "") ? (sp.papel as AuthorRole | "todas") : "autoria";
  const group = (["norma", "requerimento", "emenda_parecer", "todos"].includes(sp.tipo ?? "") ? sp.tipo : "norma") as "norma" | "requerimento" | "emenda_parecer" | "todos";
  const topicRows = await db.select().from(topics).orderBy(asc(topics.sortOrder));
  const topic = topicRows.find((t) => t.slug === sp.tema);
  const page = Math.max(1, Number(sp.pagina) || 1);
  const [stats, props] = await Promise.all([
    personPropositionStats(personId),
    personPropositions(personId, { role, group, codTemas: topic?.camaraThemeCodes, limit: 12, offset: (page - 1) * 12 }),
  ]);
  const count = (r: AuthorRole) => stats.filter((s) => s.role === r && s.group === "norma").reduce((a, s) => a + s.count, 0);
  const keep = { papel: sp.papel, tipo: sp.tipo, tema: sp.tema };
  return (
    <div className="space-y-4">
      <ChipNav
        label="Papel"
        items={([...AUTHOR_ROLES, "todas"] as const)
          .filter((r) => r === "todas" || r === "autoria" || r === "coautoria" || count(r) > 0)
          .map((r) => ({
            key: r,
            label: r === "todas" ? "Todos" : <>{ROLE_LABEL[r]} <span className="opacity-70">{count(r)}</span></>,
            href: tabHref("projetos", { ...keep, papel: r, pagina: undefined }),
            active: role === r,
          }))}
      />
      <ChipNav
        label="Tema"
        items={[{ key: "", label: "Todos os temas", href: tabHref("projetos", { ...keep, tema: undefined, pagina: undefined }), active: !topic }, ...topicRows.map((t) => ({
          key: t.slug, label: <><TopicIcon slug={t.slug} /> {t.name}</>, href: tabHref("projetos", { ...keep, tema: t.slug, pagina: undefined }), active: topic?.slug === t.slug,
        }))]}
      />
      <p className="text-sm text-ink-2">
        <strong>{props.total.toLocaleString("pt-BR")}</strong> {group === "norma" ? "projetos" : "proposições"}
        {role !== "todas" ? ` · ${ROLE_LABEL[role as AuthorRole].toLowerCase()}` : ""}{topic ? ` · ${topic.name}` : ""}
        {role !== "todas" && <span className="text-ink-3"> — {ROLE_HELP[role as AuthorRole]}</span>}
      </p>
      {props.items.length === 0 ? <EmptyState title="Nada encontrado com esses filtros">Isso não significa que não exista: a base cobre proposições a partir de 2019.</EmptyState> : <PropositionGrid items={props.items} />}
      <div className="flex justify-between text-sm">
        {page > 1 ? <Link className="rounded-lg border border-line px-3 py-1.5" href={tabHref("projetos", { ...keep, pagina: String(page - 1) })}>← Anteriores</Link> : <span />}
        {page * 12 < props.total && <Link className="rounded-lg border border-line px-3 py-1.5" href={tabHref("projetos", { ...keep, pagina: String(page + 1) })}>Mais →</Link>}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="text-ink-3">Mostrar:</span>
        {[["norma", "Projetos de lei e PECs"], ["requerimento", "Requerimentos"], ["emenda_parecer", "Emendas e pareceres"], ["todos", "Tudo"]].map(([k, l]) => (
          <Link key={k} href={tabHref("projetos", { ...keep, tipo: k, pagina: undefined })} className={group === k ? "font-semibold underline" : "text-ink-2 hover:underline"}>{l}</Link>
        ))}
      </div>
      <AboutData>
        <p>Papéis vêm dos campos “proponente” e “ordem de assinatura” da Câmara. {AUTHOR_ROLES.map((r) => `${ROLE_LABEL[r]}: ${ROLE_HELP[r]}`).join(" ")}</p>
        <p>Temas seguem a classificação da própria Câmara; projetos sem tema atribuído não aparecem no filtro de tema.</p>
      </AboutData>
    </div>
  );
}

async function Spending({ personId, year, tabHref, camaraId }: { personId: string; year?: number; tabHref: (k: string, e?: Record<string, string | undefined>) => string; camaraId: string | null }) {
  const s = await ceapSummary(personId, year);
  if (!s) return <EmptyState title="Sem gastos de cota parlamentar na base">Cobrimos os arquivos da Câmara de 2023 em diante.</EmptyState>;
  const top = s.categories[0];
  return (
    <div className="space-y-6">
      <ChipNav label="Ano" items={s.years.map((y) => ({ key: String(y), label: String(y), href: tabHref("gastos", { ano: String(y) }), active: y === s.year }))} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
        <StatTile label={`Total em ${s.year}`} value={formatBRLCompact(s.total)} hint={`${s.documents.toLocaleString("pt-BR")} notas · até ${s.lastMonth ? MONTHS_SHORT[s.lastMonth - 1] : "—"}`} />
        <StatTile label="Média por mês" value={formatBRLCompact(s.total / Math.max(1, s.months.length))} hint={`${s.months.length} meses com dados`} />
        <StatTile label="Maior categoria" value={top ? top.label : "—"} hint={top ? `${formatBRLCompact(top.value)} · ${Math.round((top.value / s.total) * 100)}% do total` : undefined} />
      </div>
      <Card>
        <h2 className="font-serif text-lg">Gasto por mês em {s.year}</h2>
        <p className="text-sm text-ink-3">Em reais, valor reembolsado (líquido), por mês de competência.</p>
        <ColumnChart ariaLabel={`Gasto mensal da cota parlamentar em ${s.year}`} data={s.months.map((m) => ({ label: MONTHS_SHORT[m.month - 1], value: m.value }))} />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ink-2">Ver em tabela</summary>
          <table className="mt-2 w-full text-sm"><tbody>{s.months.map((m) => <tr key={m.month} className="border-t border-line"><td className="py-1">{MONTHS_SHORT[m.month - 1]}</td><td className="text-right tabular-nums">{formatBRL(m.value, true)}</td></tr>)}</tbody></table>
        </details>
      </Card>
      <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <h2 className="mb-4 font-serif text-lg">Em que foi gasto</h2>
          <BarList total={s.total} data={s.categories.slice(0, 8).map((c) => ({ label: c.label, value: c.value, detail: `${c.documents} notas` }))} />
          {s.categories.length > 8 && <p className="mt-3 text-xs text-ink-3">+ {s.categories.length - 8} categorias menores</p>}
        </Card>
        <Card>
          <h2 className="mb-4 font-serif text-lg">Maiores fornecedores</h2>
          <ol className="space-y-3 text-sm">
            {s.suppliers.map((f, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{f.name}</span>
                  <span className="text-xs text-ink-3">{f.category}{f.cnpj ? ` · CNPJ ${f.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}` : ""}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatBRLCompact(f.value)}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <AboutData title="O que é a cota parlamentar?">
        <p>A Cota para o Exercício da Atividade Parlamentar (CEAP) reembolsa despesas do mandato — combustível, escritório, passagens, divulgação etc. — mediante apresentação de nota fiscal. O limite mensal varia por estado.</p>
        <p><strong>Usar a cota não é irregularidade.</strong> Valores altos podem refletir a distância do estado até Brasília, por exemplo. Para ver cada nota, consulte a {camaraId ? <a className="underline" href={`https://www.camara.leg.br/deputados/${camaraId}`} target="_blank" rel="noopener noreferrer">página oficial do deputado</a> : "página oficial"}.</p>
        <p>Fonte: arquivos anuais da Câmara (www.camara.leg.br/cotas), vinculados pelo ID oficial. Pessoas físicas fornecedoras aparecem sem nome nem CPF.</p>
      </AboutData>
    </div>
  );
}

async function Assets({ personId }: { personId: string }) {
  const a = await declaredAssetsSummary(personId);
  if (!a) return <EmptyState title="Sem declaração de bens vinculada">Vinculamos as declarações ao TSE da eleição de 2022 para quem disputou o cargo de deputado federal. Suplentes que não concorreram em 2022 podem não aparecer.</EmptyState>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile label={`Total declarado em ${a.electionYear}`} value={formatBRLCompact(a.total)} hint={`${a.count} bens declarados ao TSE`} />
        <StatTile label="Maior grupo" value={a.groups[0]?.group ?? "—"} hint={a.groups[0] ? formatBRLCompact(a.groups[0].value) : undefined} />
      </div>
      <Card>
        <h2 className="mb-4 font-serif text-lg">Composição do patrimônio declarado</h2>
        <BarList total={a.total} data={a.groups.map((g) => ({ label: g.group, value: g.value, detail: `${g.count} itens` }))} />
      </Card>
      <Card>
        <h2 className="mb-3 font-serif text-lg">Itens declarados</h2>
        <ul className="divide-y divide-line text-sm">
          {a.items.map((i, k) => (
            <li key={k} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-ink">{i.type.charAt(0) + i.type.slice(1).toLowerCase()}</span>
                {i.description && <span className="block truncate text-xs text-ink-3">{i.description}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{formatBRL(i.value, true)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <AboutData title="Como ler o patrimônio declarado">
        <p>É o que a própria pessoa declarou à Justiça Eleitoral ao registrar a candidatura em {a.electionYear}. Os valores costumam seguir a declaração de imposto de renda (muitas vezes pelo valor de compra, não de mercado) e não são corrigidos pela inflação.</p>
        <p>Variações de patrimônio entre eleições não indicam, sozinhas, irregularidade.</p>
        <p>Fonte: TSE — bens de candidatos. O vínculo com o perfil foi feito pelo CPF que consta nos arquivos oficiais da Câmara e do TSE; o CPF não é armazenado.</p>
      </AboutData>
    </div>
  );
}

async function News({ name }: { name: string }) {
  const news = await personNewsMentions(name, 20);
  return (
    <div className="space-y-3">
      {news.length === 0 ? <EmptyState title="Nenhuma notícia recente menciona este nome" /> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {news.map((n) => (
            <li key={n.id}>
              <Link href={`/noticias/${n.id}`} className="block h-full rounded-2xl border border-line bg-surface p-4 shadow-card hover:border-ink-3">
                <p className="text-xs text-ink-3"><TopicIcon slug={n.topic_slug} /> {formatDate(n.publishedAt)}</p>
                <p className="mt-1 font-serif text-lg leading-snug">{n.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <AboutData><p>Notícias que citam o nome “{name}”. É correspondência de texto: pode incluir homônimos e não comprova nada sobre a pessoa.</p></AboutData>
    </div>
  );
}
