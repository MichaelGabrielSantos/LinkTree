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
import { Badge, Card, Notice, SectionTitle } from "@/components/ui";
import { STAGE_INFO, typeGroup, type Stage, PROPOSAL_TYPE_LABEL } from "@/domain/legislative-stage";
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

const PIPELINE: Array<{ key: string; label: string; stages: Stage[] }> = [
  { key: "apr", label: "Apresentação", stages: ["apresentada"] },
  { key: "com", label: "Comissões", stages: ["em_comissao", "parecer_apresentado", "aprovada_comissao", "rejeitada_comissao"] },
  { key: "ple", label: "Plenário", stages: ["aprovada_1turno", "aprovada_plenario"] },
  { key: "sen", label: "Outra Casa", stages: ["remetida_senado"] },
  { key: "san", label: "Sanção ou promulgação", stages: ["remetida_sancao", "remetida_promulgacao"] },
  { key: "lei", label: "Norma publicada", stages: ["norma_juridica"] },
];

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
  const group = typeGroup(p.siglaTipo);
  const ident = `${p.siglaTipo} ${p.numero}/${p.ano}`;
  const camaraPage = `https://www.camara.leg.br/propostas-legislativas/${p.externalId}`;

  return (
    <article>
      <p className="text-sm text-ink-3">
        <Link href="/explorar?aba=projetos" className="underline">Projetos</Link> / {ident}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge>{p.descricaoTipo ?? PROPOSAL_TYPE_LABEL[p.siglaTipo] ?? p.siglaTipo}</Badge>
        <Badge tone={stageInfo.isLaw ? "ok" : terminal ? "warn" : "accent"}>{stageInfo.label}</Badge>
        {group !== "norma" && <Badge tone="warn">Não é um projeto que vira lei ({PROPOSAL_TYPE_LABEL[p.siglaTipo] ?? p.siglaTipo})</Badge>}
      </div>
      <h1 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl">{ident}</h1>
      <p className="mt-3 text-lg text-ink">{p.ementa}</p>
      {p.ementaDetalhada && <p className="mt-2 text-ink-2">{p.ementaDetalhada}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <FollowButton targetType="proposition" targetId={p.id} following={following} next={`/projetos/${p.id}`} label="tramitação" />
        <SaveButton itemType="proposition" itemId={p.id} saved={saved} next={`/projetos/${p.id}`} />
        {p.urlInteiroTeor && (
          <a href={p.urlInteiroTeor} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">Texto original (PDF) ↗</a>
        )}
        <a href={camaraPage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">Página na Câmara ↗</a>
      </div>

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

      <Card className="mt-5">
        <h2 className="font-serif text-lg">Em que etapa está</h2>
        <ol className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-6" aria-label="Etapas do processo legislativo">
          {PIPELINE.map((s, i) => {
            const state = terminal ? "off" : i < currentIdx ? "done" : i === currentIdx ? "now" : "off";
            return (
              <li key={s.key} aria-current={state === "now" ? "step" : undefined}
                className={`rounded-lg border px-2 py-2 ${state === "now" ? "border-accent bg-accent-soft font-semibold" : state === "done" ? "border-line bg-surface-2" : "border-dashed border-line text-ink-3"}`}>
                {s.label}{state === "done" ? " ✓" : ""}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm"><strong>{stageInfo.label}.</strong> {stageInfo.explanation}</p>
        <p className="mt-1 text-sm text-ink-2">
          Situação registrada pela Câmara: <em>{p.statusSituacao ?? "não informada"}</em>
          {p.statusTramitacao && <> · última movimentação: {p.statusTramitacao} ({p.statusOrgao ?? "—"}) em {formatDate(p.statusAt)}</>}
        </p>
        {!stageInfo.isLaw && <p className="mt-2 text-sm font-medium text-ink">Esta proposta não é lei. {terminal ? "A tramitação foi encerrada nesta etapa." : "Ainda depende das etapas seguintes."}</p>}
        <p className="mt-2 text-xs text-ink-3">
          A posição no diagrama é uma classificação automática do Contexto a partir dos códigos de tramitação da Câmara. A sequência real varia por tipo de proposta e regime.
          {meaningful(p.apreciacao) ? ` Forma de apreciação: ${p.apreciacao}.` : ""}{meaningful(p.regime) ? ` Regime: ${p.regime}.` : ""}
        </p>
      </Card>

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
