import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { personExternalIds } from "@/server/db/schema";
import { getProposition, refreshPropositionIfStale } from "@/server/queries/proposition";
import { getCurrentUser } from "@/server/auth";
import { isFollowing, savedIdSet } from "@/server/user-data";
import { FollowButton, SaveButton } from "@/components/actions-ui";
import { ExplainPanel } from "@/components/explain-panel";
import { Assistant } from "@/components/assistant";
import { AboutData, Badge, Card, Notice, SectionTitle } from "@/components/ui";
import { PIPELINE, STAGE_INFO, stageBadge, typeGroup, type Stage, PROPOSAL_TYPE_LABEL } from "@/domain/legislative-stage";
import { cardTitle } from "@/components/proposition-card";
import { ROLE_LABEL, roleOf, type AuthorRole } from "@/domain/authorship";
import { formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/** A fonte às vezes publica "." ou "Indefinida" como valor. */
const meaningful = (v: string | null) => !!v && /[a-z]{3}/i.test(v) && !/^indefinid/i.test(v.trim());
type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const v = await getProposition((await params).id);
  return { title: v ? `${v.prop.siglaTipo} ${v.prop.numero}/${v.prop.ano}` : "Projeto" };
}


export default async function ProjetoPage({ params }: { params: Params }) {
  const { id } = await params;
  let view = await getProposition(id);
  if (!view) notFound();
  const refresh = await refreshPropositionIfStale(view.prop);
  if (refresh.refreshed) view = (await getProposition(id))!;
  const { prop: p, authors, themes, tramitacoes, versions, text, main, attached, stage, stageInfo } = view;
  const user = await getCurrentUser();
  const [following, saved] = user
    ? await Promise.all([isFollowing(user.id, { targetType: "proposition", targetId: p.id }), savedIdSet(user.id, "proposition", [p.id]).then((s) => s.has(p.id))])
    : [false, false];
  const rapporteur = p.lastRapporteurExternalId
    ? await db.query.personExternalIds.findFirst({ where: and(eq(personExternalIds.system, "camara"), eq(personExternalIds.externalId, p.lastRapporteurExternalId)) })
    : null;
  const byRole = (r: AuthorRole) => authors.filter((a) => roleOf(a.proponent, a.signatureOrder) === r);
  const proponents = byRole("autoria");
  const coauthors = byRole("coautoria");
  const supporters = byRole("apoio");
  const unknownRole = byRole("nao_verificado");
  const terminal = ["arquivada", "retirada", "rejeitada", "prejudicada"].includes(stage);
  const currentIdx = PIPELINE.findIndex((s) => s.stages.includes(stage));
  const baseBadge = stageBadge(stage);
  const badge = stage === "norma_juridica" && ["PL", "PLP", "PLV", "MPV"].includes(p.siglaTipo) ? { ...baseBadge, label: "Virou lei" } : baseBadge;
  const group = typeGroup(p.siglaTipo);
  const ident = `${p.siglaTipo} ${p.numero}/${p.ano}`;
  const camaraPage = `https://www.camara.leg.br/propostas-legislativas/${p.externalId}`;

  return (
    <article>
      <p className="text-sm text-ink-3">
        <Link href="/explorar?aba=projetos" className="hover:underline">← Projetos</Link>
      </p>
      <header className="mt-3 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-3">
            {ident} <span className="font-normal normal-case tracking-normal">· {p.descricaoTipo ?? PROPOSAL_TYPE_LABEL[p.siglaTipo] ?? p.siglaTipo}</span>
          </p>
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${stageInfo.isLaw ? "bg-ok-bg text-ok-ink" : terminal ? "bg-surface-2 text-ink-2" : "bg-accent-soft text-ink"}`}>
            <span aria-hidden>{badge.icon}</span> {badge.label}
          </span>
        </div>
        <h1 className="mt-3 font-serif text-2xl leading-snug sm:text-3xl">{cardTitle(p.ementa, 400)}</h1>
        {p.ementaDetalhada && <p className="mt-3 text-ink-2">{p.ementaDetalhada}</p>}
        {group !== "norma" && <p className="mt-3 text-sm text-warn-ink">Este é um {(PROPOSAL_TYPE_LABEL[p.siglaTipo] ?? p.siglaTipo).toLowerCase()}, não um projeto que pode virar lei.</p>}

        <ol className="mt-6 grid grid-cols-6 gap-1" aria-label="Etapas do processo legislativo">
          {PIPELINE.map((st, i) => {
            const state = terminal ? "off" : i < currentIdx ? "done" : i === currentIdx ? "now" : "off";
            return (
              <li key={st.key} aria-current={state === "now" ? "step" : undefined} className="min-w-0">
                <span className={`block h-2 rounded-full ${state === "off" ? "bg-chart-track" : stageInfo.isLaw ? "bg-ok-ink" : "bg-chart-1"}`} />
                <span className={`mt-1.5 block text-[11px] leading-tight sm:text-xs ${state === "now" ? "font-semibold text-ink" : "text-ink-3"}`}>{st.label}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-ink"><strong>{stageInfo.label}.</strong> {stageInfo.explanation}</p>
        {!stageInfo.isLaw && <p className="mt-1 text-sm font-medium text-ink-2">Ainda não é lei{terminal ? " — a tramitação foi encerrada." : "."}</p>}

        <div className="mt-5 flex flex-wrap gap-2">
          <FollowButton targetType="proposition" targetId={p.id} following={following} next={`/projetos/${p.id}`} label="tramitação" />
          <SaveButton itemType="proposition" itemId={p.id} saved={saved} next={`/projetos/${p.id}`} />
          {p.urlInteiroTeor && (
            <a href={p.urlInteiroTeor} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">Texto original ↗</a>
          )}
          <a href={camaraPage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">Na Câmara ↗</a>
        </div>
      </header>

      <div className="mt-4 space-y-2">
        {refresh.error && (
          <Notice tone="warn" title="Não foi possível atualizar agora">
            A Câmara não respondeu a tempo. Mostrando os dados coletados em {formatDateTime(p.updatedAt)}.
          </Notice>
        )}
        {!p.detailSyncedAt && !refresh.refreshed && (
          <Notice tone="warn">Tramitação detalhada ainda não sincronizada para esta proposição. A situação abaixo vem do arquivo anual da Câmara.</Notice>
        )}
      </div>

      <div className="mt-4">
        <AboutData title="Detalhes da situação">
          <p>Situação registrada pela Câmara: <em>{p.statusSituacao ?? "não informada"}</em>{p.statusTramitacao && <> · última movimentação: {p.statusTramitacao} ({p.statusOrgao ?? "—"}) em {formatDate(p.statusAt)}</>}.</p>
          <p>A etapa no diagrama é uma classificação automática do Contexto a partir dos códigos de tramitação. A sequência real varia por tipo de proposta e regime.{meaningful(p.apreciacao) ? ` Forma de apreciação: ${p.apreciacao}.` : ""}{meaningful(p.regime) ? ` Regime: ${p.regime}.` : ""}</p>
        </AboutData>
      </div>

      <section aria-labelledby="autores">
        <SectionTitle id="autores">Autoria</SectionTitle>
        {authors.length === 0 ? (
          <p className="text-sm text-ink-2">Autores não informados na base atual.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <p className="text-sm font-semibold">{ROLE_LABEL.autoria}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {proponents.map((a) => <li key={a.id}>{a.personId ? <Link className="underline" href={`/politicos/${a.personId}`}>{a.name}</Link> : a.name} <span className="text-ink-3">· {a.authorType}</span></li>)}
                {proponents.length === 0 && <li className="text-ink-3">Primeiro signatário não identificado.</li>}
              </ul>
              {coauthors.length > 0 && (
                <>
                  <p className="mt-3 text-sm font-semibold">{ROLE_LABEL.coautoria} ({coauthors.length})</p>
                  <ul className="mt-1 max-h-60 space-y-1 overflow-y-auto text-sm">
                    {coauthors.map((a) => <li key={a.id}>{a.personId ? <Link className="underline" href={`/politicos/${a.personId}`}>{a.name}</Link> : a.name}</li>)}
                  </ul>
                </>
              )}
            </Card>
            {(supporters.length > 0 || unknownRole.length > 0) && (
              <Card>
                {supporters.length > 0 && <p className="text-sm font-semibold">{ROLE_LABEL.apoio} ({supporters.length}) <span className="font-normal text-ink-3">— não são autores</span></p>}
                <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-sm">
                  {supporters.map((a) => <li key={a.id}>{a.personId ? <Link className="underline" href={`/politicos/${a.personId}`}>{a.name}</Link> : a.name}</li>)}
                </ul>
                {unknownRole.length > 0 && (
                  <>
                    <p className="mt-3 text-sm font-semibold">Papel não verificado ({unknownRole.length})</p>
                    <ul className="mt-1 space-y-1 text-sm">{unknownRole.map((a) => <li key={a.id}>{a.personId ? <Link className="underline" href={`/politicos/${a.personId}`}>{a.name || "Parlamentar"}</Link> : a.name}</li>)}</ul>
                  </>
                )}
              </Card>
            )}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-3">Papéis derivados dos campos “proponente” e “ordem de assinatura” da Câmara. Partidos não são exibidos aqui para não aplicar o partido atual a um registro antigo.</p>
        <p className="mt-2 text-sm">
          <strong>Relatoria:</strong>{" "}
          {p.lastRapporteurExternalId ? (
            rapporteur ? <Link className="underline" href={`/politicos/${rapporteur.personId}`}>último relator registrado</Link> : <>último relator registrado: ID Câmara {p.lastRapporteurExternalId}</>
          ) : "nenhum relator registrado no último status."}{" "}
          <span className="text-xs text-ink-3">Relatoria é diferente de autoria.</span>
        </p>
      </section>

      {themes.length > 0 && (
        <p className="mt-4 flex flex-wrap gap-1 text-xs">
          <span className="text-ink-3">Temas (classificação da Câmara):</span>
          {themes.map((t) => <Badge key={t.codTema}>{t.tema}</Badge>)}
        </p>
      )}

      <section aria-labelledby="entender" id="entender">
        <SectionTitle id="entender-titulo">Entender a proposta</SectionTitle>
        <p className="mb-3 text-sm text-ink-2">
          {text?.status === "ok" || text?.status === "muito_grande"
            ? `A explicação usa o inteiro teor oficial (${text.pageCount ?? "?"} página(s), extraído em ${formatDateTime(text.extractedAt)}).`
            : text?.status === "sem_texto" || text?.status === "falha"
              ? `Não foi possível extrair o texto oficial (${text.error ?? text.status}). A explicação usará só ementa e metadados e dirá isso.`
              : "Ao pedir uma explicação, tentaremos extrair o inteiro teor oficial. Se não for possível, usaremos só ementa e metadados — e a explicação dirá isso."}
        </p>
        <ExplainPanel
          subject="proposition"
          id={p.id}
          actions={[
            { kind: "explicacao", label: "Explicar a proposta" },
            { kind: "simples", label: "Explique mais simples" },
            { kind: "exemplo", label: "Dê um exemplo do cotidiano" },
            { kind: "argumentos", label: "Argumentos documentados" },
          ]}
        />
      </section>

      <section aria-labelledby="tramitacao">
        <SectionTitle id="tramitacao" aside={tramitacoes.length ? `${tramitacoes.length} movimentações` : undefined}>Tramitação</SectionTitle>
        {tramitacoes.length === 0 ? (
          <p className="text-sm text-ink-2">Sem movimentações detalhadas sincronizadas.</p>
        ) : (
          <ol className="space-y-3 border-l-2 border-line pl-4 text-sm">
            {tramitacoes.slice(0, 12).map((t) => (
              <li key={t.sequence}>
                <p className="text-xs text-ink-3">{formatDateTime(t.at)} · {t.orgao ?? "—"} · <span className="font-semibold">{STAGE_INFO[t.stage as Stage]?.label ?? t.stage}</span></p>
                <p className="font-medium">{t.descricaoTramitacao}</p>
                {t.despacho && <p className="text-ink-2">{t.despacho}</p>}
                {t.url && <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-xs underline">documento ↗</a>}
              </li>
            ))}
          </ol>
        )}
        {tramitacoes.length > 12 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer">Ver as {tramitacoes.length - 12} movimentações anteriores</summary>
            <ol className="mt-2 space-y-2 border-l-2 border-line pl-4">
              {tramitacoes.slice(12).map((t) => (
                <li key={t.sequence}><span className="text-xs text-ink-3">{formatDate(t.at)} · {t.orgao ?? "—"}</span> — {t.descricaoTramitacao}</li>
              ))}
            </ol>
          </details>
        )}
      </section>

      {(main || attached.length > 0) && (
        <section aria-labelledby="relacionadas">
          <SectionTitle id="relacionadas">Proposições relacionadas</SectionTitle>
          {main && <p className="text-sm">Tramita junto (apensada) à proposição principal <Link className="underline" href={`/projetos/${main.id}`}>{main.siglaTipo} {main.numero}/{main.ano}</Link>.</p>}
          {attached.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {attached.map((x) => <li key={x.id}><Link className="underline" href={`/projetos/${x.id}`}>{x.siglaTipo} {x.numero}/{x.ano}</Link> — {x.ementa.slice(0, 140)}</li>)}
            </ul>
          )}
          <p className="mt-1 text-xs text-ink-3">Apensadas, emendas e substitutivos não são leis diferentes: seguem a tramitação da principal.</p>
        </section>
      )}

      <section aria-labelledby="votacoes">
        <SectionTitle id="votacoes">Votações</SectionTitle>
        <Notice tone="info">Votações ainda não estão integradas ao Contexto (previsto para o próximo incremento). Para ver votações, consulte a <a className="underline" href={camaraPage} target="_blank" rel="noopener noreferrer">página da Câmara</a>.</Notice>
      </section>

      <section aria-labelledby="registro">
        <SectionTitle id="registro">Registro e versões</SectionTitle>
        <ul className="text-sm text-ink-2">
          <li>Fonte: Câmara dos Deputados — Dados Abertos · ID {p.externalId} · <a className="underline" href={`https://dadosabertos.camara.leg.br/api/v2/proposicoes/${p.externalId}`} target="_blank" rel="noopener noreferrer">registro na API ↗</a></li>
          <li>Primeira coleta: {formatDateTime(p.collectedAt)} · última alteração detectada: {formatDateTime(p.updatedAt)} · detalhe sincronizado: {formatDateTime(p.detailSyncedAt)}</li>
          <li>Versão atual: {p.version} ({versions.length} versão(ões) preservada(s)).</li>
        </ul>
      </section>

      <div className="mt-8">
        <Assistant context={{ type: "proposition", id: p.id }} title="Perguntar sobre esta proposta" suggestions={["O que falta para isso virar lei?", "Quem pode ser afetado?", "O que diz a justificativa do autor?"]} />
      </div>
    </article>
  );
}
