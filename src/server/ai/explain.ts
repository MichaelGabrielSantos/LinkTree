import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { generatedAnswers } from "../db/schema";
import { sha256, stableHash } from "@/lib/hash";
import { truncateAtSentence } from "@/lib/text";
import { STAGE_INFO } from "@/domain/legislative-stage";
import { ROLE_LABEL, roleOf } from "@/domain/authorship";
import { finalizeEvidence, renderEvidenceForPrompt, type Evidence } from "./evidence";
import { ExplanationSchema, PROMPT_VERSION, SYSTEM_RULES, validateExplanation, type Explanation, type ValidationReport } from "./grounding";
import { getProvider } from "./provider";
import { canCallModel, recordUsage } from "./budget";
import type { getNewsArticle } from "../queries/news";
import type { PropositionView } from "../queries/proposition";

export type ExplainKind = "explicacao" | "simples" | "exemplo" | "argumentos" | `termo:${string}`;

export type ExplainResult =
  | { status: "ok" | "abstencao"; explanation: Explanation; evidence: PublicEvidence[]; validation: ValidationReport; cached: boolean; model: string; createdAt: Date; subjectVersionHash: string }
  | { status: "indisponivel"; reason: string; evidence: PublicEvidence[] };

export type PublicEvidence = Omit<Evidence, "text"> & { excerpt: string };

export const toPublicEvidence = (e: Evidence): PublicEvidence => {
  const { text, ...rest } = e;
  return { ...rest, excerpt: truncateAtSentence(text.replace(/\s+/g, " "), 280) };
};

type NewsView = NonNullable<Awaited<ReturnType<typeof getNewsArticle>>>;

const MIN_LEAD_FOR_EXPLANATION = 200;

export function newsEvidence(view: NewsView): Evidence[] {
  const a = view.article;
  const list: Omit<Evidence, "ref">[] = [
    {
      kind: "noticia",
      title: a.title,
      sourceName: view.source.name,
      url: a.url,
      date: a.publishedAt.toISOString(),
      collectedAt: a.collectedAt.toISOString(),
      versionHash: a.contentHash,
      text: a.lead,
      limitation:
        a.feedTextLength > a.lead.length
          ? `Apenas o trecho inicial (${a.lead.length} de ${a.feedTextLength} caracteres do feed). Detalhes do restante da matéria não estão disponíveis aqui.`
          : "Trecho fornecido pelo feed RSS.",
      recordType: "news",
      recordId: a.id,
    },
  ];
  return finalizeEvidence(list);
}

export function propositionEvidence(view: PropositionView): Evidence[] {
  const p = view.prop;
  const ident = `${p.siglaTipo} ${p.numero}/${p.ano}`;
  const collected = p.updatedAt.toISOString();
  const list: Omit<Evidence, "ref">[] = [
    {
      kind: "proposicao",
      title: `${ident} — identificação e situação`,
      sourceName: "Câmara dos Deputados — Dados Abertos",
      url: `https://www.camara.leg.br/propostas-legislativas/${p.externalId}`,
      date: p.presentedAt?.toISOString() ?? null,
      collectedAt: collected,
      versionHash: p.contentHash,
      text: [
        `Tipo: ${p.descricaoTipo ?? p.siglaTipo}`,
        `Apresentação: ${p.presentedAt ? p.presentedAt.toISOString().slice(0, 10) : "não informada"}`,
        `Ementa: ${p.ementa}`,
        p.ementaDetalhada ? `Ementa detalhada: ${p.ementaDetalhada}` : null,
        p.keywords ? `Palavras-chave: ${p.keywords}` : null,
        `Situação registrada: ${p.statusSituacao ?? "não informada"}`,
        `Última movimentação: ${p.statusTramitacao ?? "—"} (${p.statusOrgao ?? "—"}) em ${p.statusAt?.toISOString().slice(0, 10) ?? "—"}`,
        p.regime && /[a-z]{3}/i.test(p.regime) ? `Regime: ${p.regime}` : null,
        p.apreciacao && /[a-z]{3}/i.test(p.apreciacao) ? `Forma de apreciação: ${p.apreciacao}` : null,
        `Etapa (classificação do Contexto): ${view.stageInfo.label}. ${view.stageInfo.explanation}`,
      ]
        .filter(Boolean)
        .join("\n"),
      recordType: "proposition",
      recordId: p.id,
    },
  ];
  if (view.authors.length) {
    list.push({
      kind: "autoria",
      title: `${ident} — autoria`,
      sourceName: "Câmara dos Deputados — Dados Abertos",
      url: `https://dadosabertos.camara.leg.br/api/v2/proposicoes/${p.externalId}/autores`,
      date: null,
      collectedAt: collected,
      versionHash: stableHash(view.authors.map((a) => [a.authorKey, a.proponent])),
      text: view.authors
        .slice(0, 40)
        .map((a) => `${a.name} (${a.authorType ?? "autor"}) — ${ROLE_LABEL[roleOf(a.proponent, a.signatureOrder)]}`)
        .join("\n"),
      recordType: "proposition",
      recordId: p.id,
    });
  }
  if (view.tramitacoes.length) {
    const recent = view.tramitacoes.slice(0, 15);
    list.push({
      kind: "tramitacao",
      title: `${ident} — tramitação (${recent.length} movimentações mais recentes)`,
      sourceName: "Câmara dos Deputados — Dados Abertos",
      url: `https://dadosabertos.camara.leg.br/api/v2/proposicoes/${p.externalId}/tramitacoes`,
      date: recent[0].at.toISOString(),
      collectedAt: collected,
      versionHash: stableHash(recent.map((t) => [t.sequence, t.at.toISOString(), t.codTipoTramitacao])),
      text: recent
        .map((t) => `${t.at.toISOString().slice(0, 10)} · ${t.orgao ?? "—"} · ${t.descricaoTramitacao ?? ""} [${STAGE_INFO[t.stage as keyof typeof STAGE_INFO]?.label ?? t.stage}]${t.despacho ? ` — ${truncateAtSentence(t.despacho, 300)}` : ""}`)
        .join("\n"),
      recordType: "proposition",
      recordId: p.id,
    });
  }
  if (view.text?.status === "ok" || view.text?.status === "muito_grande") {
    const MAX = 60_000;
    const t = view.text.text ?? "";
    list.push({
      kind: "texto_oficial",
      title: `${ident} — inteiro teor (texto oficial)`,
      sourceName: "Câmara dos Deputados",
      url: view.text.url,
      date: p.presentedAt?.toISOString() ?? null,
      collectedAt: view.text.extractedAt.toISOString(),
      versionHash: view.text.contentHash ?? "",
      text: t.slice(0, MAX),
      limitation: t.length > MAX || view.text.status === "muito_grande" ? `Texto truncado em ${MAX.toLocaleString("pt-BR")} caracteres; partes finais podem não ter sido analisadas.` : undefined,
      recordType: "proposition",
      recordId: p.id,
    });
  }
  return finalizeEvidence(list);
}

const NEWS_SECTIONS = `Seções possíveis (use só as que tiverem conteúdo sustentado; omita as demais):
- chave "o_que_aconteceu", título "O que aconteceu"
- chave "contexto", título "Contexto necessário"
- chave "por_que_importa", título "Por que isso importa"
- chave "confirmado", título "O que está confirmado"
- chave "nao_se_sabe", título "O que ainda não se sabe"`;

const PROP_SECTIONS = `Seções possíveis (use só as que tiverem conteúdo sustentado; omita as demais):
- chave "o_que_muda", título "O que a proposta pretende mudar"
- chave "como_e_hoje", título "Como funciona hoje" (só se os documentos permitirem verificar)
- chave "quem_e_afetado", título "Quem pode ser afetado"
- chave "o_que_falta", título "O que precisa acontecer para valer"
- chave "argumentos", título "Argumentos documentados" (apenas argumentos que constem nos documentos, atribuídos a quem os fez — ex.: justificativa do autor)
- chave "incertezas", título "Incertezas"`;

function instructionFor(kind: ExplainKind, subject: "news" | "proposition"): string {
  const sections = subject === "news" ? NEWS_SECTIONS : PROP_SECTIONS;
  if (kind === "simples") return `Explique de forma ainda mais simples, para quem nunca acompanhou o assunto. Frases curtas. Não mude o significado: estimativas continuam estimativas, alegações continuam atribuídas.\n${sections}`;
  if (kind === "exemplo") return `Dê um exemplo do cotidiano que ajude a entender. Coloque-o numa seção chave "exemplo", título "Exemplo do cotidiano", com tipo "exemplo_hipotetico", deixando claro no texto que é uma ilustração. Inclua também 1 ou 2 itens factuais que o exemplo ilustra, com evidência.`;
  if (kind === "argumentos") return `Liste os argumentos e evidências documentados sobre o tema, cada um atribuído a quem o fez (tipo "alegacao"), numa seção chave "argumentos", título "Argumentos e evidências". Não invente argumentos contrários ou favoráveis que não estejam nos documentos; se só houver um lado documentado, diga isso nas ressalvas.`;
  if (kind.startsWith("termo:")) return `Explique o termo "${kind.slice(6)}" como aparece neste material, numa seção chave "termo", título "O termo", e preencha "termos". Se o termo não aparecer nos documentos, diga isso.`;
  return `Explique o material de forma acessível.\n${sections}`;
}

async function cachedOrGenerate(args: {
  kind: ExplainKind;
  subjectType: "news" | "proposition";
  subjectId: string;
  evidence: Evidence[];
  extraContext?: string;
}): Promise<ExplainResult> {
  const provider = getProvider();
  const subjectVersionHash = sha256(args.evidence.map((e) => `${e.ref}:${e.versionHash}`).join("|"));
  const level = args.kind;
  const cacheKey = sha256([args.kind, args.subjectType, args.subjectId, subjectVersionHash, PROMPT_VERSION, provider.model].join("|"));
  const publicEvidence = args.evidence.map(toPublicEvidence);

  const cached = await db.query.generatedAnswers.findFirst({ where: eq(generatedAnswers.cacheKey, cacheKey) });
  if (cached && cached.status !== "rejeitada") {
    return {
      status: cached.status === "ok" ? "ok" : "abstencao",
      explanation: cached.payload as Explanation,
      evidence: publicEvidence,
      validation: cached.validation as ValidationReport,
      cached: true,
      model: cached.model,
      createdAt: cached.createdAt,
      subjectVersionHash,
    };
  }
  if (!provider.configured) {
    return { status: "indisponivel", reason: "O provedor de IA não está configurado neste ambiente. Mostramos apenas os registros da fonte.", evidence: publicEvidence };
  }
  if (!(await canCallModel())) {
    return { status: "indisponivel", reason: "O limite diário de uso de IA foi atingido. Tente novamente amanhã; os registros da fonte continuam disponíveis.", evidence: publicEvidence };
  }
  const user = [
    instructionFor(args.kind, args.subjectType),
    args.extraContext ?? "",
    renderEvidenceForPrompt(args.evidence),
    `Responda no formato JSON pedido. Em "evidencias" use apenas refs como "E1".`,
  ].join("\n\n");
  const res = await provider.generate({ system: SYSTEM_RULES, user, schema: ExplanationSchema, route: `explain:${args.subjectType}`, maxTokens: 8000 });
  await recordUsage(`explain:${args.subjectType}:${args.kind}`, res.model, res.inputTokens, res.outputTokens, res.ok ? "ok" : res.reason);
  if (!res.ok) {
    const reason =
      res.reason === "recusa"
        ? "O modelo recusou gerar esta explicação."
        : res.reason === "limite"
          ? "O provedor de IA está com limite de uso no momento."
          : "Falha técnica ao gerar a explicação. Os registros da fonte continuam disponíveis.";
    return { status: "indisponivel", reason, evidence: publicEvidence };
  }
  const { explanation, report } = validateExplanation(res.data, args.evidence);
  const status = explanation.situacao === "insuficiente" ? "abstencao" : "ok";
  const [saved] = await db
    .insert(generatedAnswers)
    .values({
      cacheKey,
      kind: args.kind,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      subjectVersionHash,
      level,
      promptVersion: PROMPT_VERSION,
      model: res.model,
      status,
      payload: explanation,
      validation: report,
    })
    .onConflictDoNothing()
    .returning();
  return { status, explanation, evidence: publicEvidence, validation: report, cached: false, model: res.model, createdAt: saved?.createdAt ?? new Date(), subjectVersionHash };
}

export async function explainNews(view: NewsView, kind: ExplainKind): Promise<ExplainResult> {
  const evidence = newsEvidence(view);
  if (view.article.lead.length < MIN_LEAD_FOR_EXPLANATION) {
    return {
      status: "indisponivel",
      reason: "O conteúdo disponível desta matéria é curto demais para uma explicação aprofundada sem inventar detalhes. Leia a matéria original.",
      evidence: evidence.map(toPublicEvidence),
    };
  }
  return cachedOrGenerate({ kind, subjectType: "news", subjectId: view.article.id, evidence });
}

export async function explainProposition(view: PropositionView, kind: ExplainKind): Promise<ExplainResult> {
  const evidence = propositionEvidence(view);
  const hasText = evidence.some((e) => e.kind === "texto_oficial");
  return cachedOrGenerate({
    kind,
    subjectType: "proposition",
    subjectId: view.prop.id,
    evidence,
    extraContext: hasText ? undefined : "Atenção: o texto integral não está disponível; só há ementa e metadados. Não deduza detalhes além da ementa e diga isso.",
  });
}
