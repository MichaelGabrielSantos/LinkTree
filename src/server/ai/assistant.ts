import { db } from "../db/client";
import { topics } from "../db/schema";
import { normalizeForMatch, truncateAtSentence } from "@/lib/text";
import { findGlossaryEntries, GLOSSARY_VERSION, isConceptQuestion, type GlossaryEntry } from "@/domain/glossary";
import { finalizeEvidence, renderEvidenceForPrompt, type Evidence } from "./evidence";
import { AnswerSchema, isLoadedQuestion, SYSTEM_RULES, validateAnswer, type Answer, type ValidationReport } from "./grounding";
import { getProvider } from "./provider";
import { canCallModel, recordUsage } from "./budget";
import { newsEvidence, propositionEvidence, toPublicEvidence, type PublicEvidence } from "./explain";
import { needsDisambiguation, searchNews, searchPersons, searchPropositions, type PersonHit } from "../queries/search";
import { getPerson, personPropositions, type AuthorRole } from "../queries/person";
import { getFeed, getNewsArticle } from "../queries/news";
import { getProposition } from "../queries/proposition";

export type AssistantContext = { type: "news" | "proposition" | "person"; id: string } | null;
export type HistoryTurn = { role: "user" | "assistant"; text: string };

export type StructuredResult = {
  person: { id: string; name: string };
  topic: { slug: string; name: string; camaraThemeCodes: number[] } | null;
  counts: Record<AuthorRole, number>;
  sample: Array<{ id: string; label: string; ementa: string; role: AuthorRole; presentedAt: string | null }>;
  coverage: string;
};

export type AssistantResponse = {
  mode: "gerada" | "estruturada" | "editorial" | "somente_evidencias" | "desambiguacao" | "sem_cobertura" | "sem_resultado" | "erro";
  answer?: Answer;
  structured?: StructuredResult;
  editorial?: GlossaryEntry[];
  candidates?: Array<Pick<PersonHit, "id" | "name" | "lastKnownParty" | "lastKnownUf" | "mandates" | "camaraId">>;
  evidence: PublicEvidence[];
  notices: string[];
  validation?: ValidationReport;
};

const PROJECT_INTENT = /\b(projet|propost|propos|apresent|autor)/;
const VOTE_INTENT = /\b(votou|voto|votacao|votacoes|votaram)\b/;

async function topicFromQuestion(q: string) {
  const all = await db.select().from(topics);
  const nq = ` ${normalizeForMatch(q)} `;
  return all.find((t) => nq.includes(` ${normalizeForMatch(t.name)} `) || nq.includes(` ${normalizeForMatch(t.slug.replace(/-/g, " "))} `)) ?? null;
}

/** Frases com iniciais maiúsculas (ex.: "Tabata Amaral") como candidatas a nome. */
export function candidateNames(question: string): string[] {
  const out: string[] = [];
  const re = /(?:deputad[oa]|senador[a]?|parlamentar)\s+([A-ZÀ-Ý][\p{L}'.-]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ý][\p{L}'.-]+)*)|([A-ZÀ-Ý][\p{L}'.-]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ý][\p{L}'.-]+)+)/gu;
  for (const m of question.matchAll(re)) out.push((m[1] ?? m[2]).trim());
  return [...new Set(out)].filter((n) => !/^(Quais|Qual|Como|O|A|Explique|Projeto|Lei)$/.test(n));
}

async function resolvePerson(question: string, context: AssistantContext, personId?: string): Promise<{ person?: { id: string; name: string }; candidates?: PersonHit[] }> {
  const explicit = personId ?? (context?.type === "person" ? context.id : undefined);
  if (explicit) {
    const p = await getPerson(explicit);
    if (p) return { person: { id: p.person.id, name: p.person.name } };
  }
  for (const name of candidateNames(question)) {
    const hits = await searchPersons(name, 6);
    if (!hits.length) continue;
    if (needsDisambiguation(hits)) return { candidates: hits };
    return { person: { id: hits[0].id, name: hits[0].name } };
  }
  return {};
}

async function structuredPropositions(person: { id: string; name: string }, question: string): Promise<StructuredResult> {
  const topic = await topicFromQuestion(question);
  const codTemas = topic?.camaraThemeCodes ?? [];
  const base = { group: "norma" as const, codTemas: codTemas.length ? codTemas : undefined };
  const [aut, coa, apo, nv, sample] = await Promise.all([
    personPropositions(person.id, { ...base, role: "autoria", limit: 1 }),
    personPropositions(person.id, { ...base, role: "coautoria", limit: 1 }),
    personPropositions(person.id, { ...base, role: "apoio", limit: 1 }),
    personPropositions(person.id, { ...base, role: "nao_verificado", limit: 1 }),
    personPropositions(person.id, { ...base, role: "todas", limit: 8 }),
  ]);
  return {
    person,
    topic: topic ? { slug: topic.slug, name: topic.name, camaraThemeCodes: codTemas } : null,
    counts: { autoria: aut.total, coautoria: coa.total, apoio: apo.total, nao_verificado: nv.total },
    sample: sample.items.map((s) => ({ id: s.id, label: `${s.siglaTipo} ${s.numero}/${s.ano}`, ementa: truncateAtSentence(s.ementa, 220), role: s.role, presentedAt: s.presentedAt?.toISOString() ?? null })),
    coverage:
      "Contagem determinística na base do Contexto: projetos que podem virar norma (PL, PLP, PEC, PDL, PRC etc.), excluindo requerimentos e emendas. " +
      "Fonte: arquivos anuais de proposições/autores da Câmara (2019 em diante) e sincronizações via API. " +
      (topic ? `Tema "${topic.name}" segundo a classificação temática da própria Câmara — proposições sem tema atribuído não entram. ` : "") +
      "Quantidade de projetos não mede produtividade nem impacto.",
  };
}

async function contextEvidence(context: AssistantContext): Promise<Evidence[]> {
  if (!context) return [];
  if (context.type === "news") {
    const v = await getNewsArticle(context.id);
    return v ? newsEvidence(v) : [];
  }
  if (context.type === "proposition") {
    const v = await getProposition(context.id);
    return v ? propositionEvidence(v) : [];
  }
  return [];
}

async function retrieve(question: string, context: AssistantContext): Promise<Evidence[]> {
  const fromContext = await contextEvidence(context);
  const topic = await topicFromQuestion(question);
  const temporal = /\b(hoje|ontem|agora|semana|ultim[oa]s?|recente)/.test(normalizeForMatch(question));
  const [recentFeed, news, props] = await Promise.all([
    topic && temporal ? getFeed({ topicSlugs: [topic.slug], sinceHours: /\bhoje\b/.test(normalizeForMatch(question)) ? 30 : 24 * 7, sort: "cronologica", limit: 6 }) : Promise.resolve([]),
    searchNews(question, { sinceHours: 24 * 30, matchAny: true }, 5),
    searchPropositions(question, { group: "norma", matchAny: true }, 4),
  ]);
  const extra: Omit<Evidence, "ref">[] = [];
  const seenNews = new Set<string>();
  const newsHits = [
    ...recentFeed.map((n) => ({ id: n.id, title: n.title, lead: n.lead, url: n.url, sourceId: n.sourceId, publishedAt: n.publishedAt })),
    ...news,
  ].filter((n) => (seenNews.has(n.id) ? false : (seenNews.add(n.id), true)));
  for (const n of newsHits.slice(0, 8)) {
    if (context?.type === "news" && n.id === context.id) continue;
    extra.push({
      kind: "noticia",
      title: n.title,
      sourceName: n.sourceId === "agencia-brasil" ? "Agência Brasil" : n.sourceId,
      url: n.url,
      date: n.publishedAt.toISOString(),
      collectedAt: null,
      versionHash: n.id,
      text: n.lead,
      limitation: "Apenas o trecho inicial da matéria.",
      recordType: "news",
      recordId: n.id,
    });
  }
  for (const p of props) {
    if (context?.type === "proposition" && p.id === context.id) continue;
    extra.push({
      kind: "proposicao",
      title: `${p.siglaTipo} ${p.numero}/${p.ano}`,
      sourceName: "Câmara dos Deputados — Dados Abertos",
      url: `https://www.camara.leg.br/propostas-legislativas/${p.externalId}`,
      date: p.presentedAt?.toISOString() ?? null,
      collectedAt: null,
      versionHash: p.id,
      text: `Ementa: ${p.ementa}\nSituação registrada: ${p.statusSituacao ?? "não informada"}`,
      limitation: "Apenas ementa e situação; o texto integral não foi analisado.",
      recordType: "proposition",
      recordId: p.id,
    });
  }
  // Renumera tudo junto para refs únicas.
  const strip = ({ ref: _r, suspicious: _s, ...rest }: Evidence) => rest;
  return finalizeEvidence([...fromContext.map(strip), ...extra]);
}

export async function askAssistant(question: string, context: AssistantContext, history: HistoryTurn[] = [], opts: { personId?: string } = {}): Promise<AssistantResponse> {
  const q = question.trim().slice(0, 1000);
  const nq = normalizeForMatch(q);
  const notices: string[] = [];
  if (isLoadedQuestion(q)) {
    notices.push("A pergunta pede um julgamento sobre uma pessoa. O Contexto não aceita a premissa: mostramos registros concretos, o contexto e os limites dessa conclusão.");
  }

  // 1) Conceitos institucionais → glossário editorial (sem IA, sem prova de fato atual).
  if (isConceptQuestion(q)) {
    return {
      mode: "editorial",
      editorial: findGlossaryEntries(q),
      evidence: [],
      notices: [...notices, `Explicação editorial do Contexto (${GLOSSARY_VERSION}), não específica de um caso concreto.`],
    };
  }

  // 2) Votos: ainda sem cobertura.
  if (VOTE_INTENT.test(nq)) {
    return {
      mode: "sem_cobertura",
      evidence: [],
      notices: [
        ...notices,
        "Votações nominais ainda não estão integradas ao Contexto (previsto para o incremento 2). Não vamos inferir votos a partir de notícias.",
      ],
      editorial: findGlossaryEntries("votacao nominal"),
    };
  }

  // 3) Projetos de uma pessoa → consulta estruturada (o modelo nunca conta registros).
  if (PROJECT_INTENT.test(nq)) {
    const resolved = await resolvePerson(q, context, opts.personId);
    if (resolved.candidates) {
      return {
        mode: "desambiguacao",
        candidates: resolved.candidates.map(({ id, name, lastKnownParty, lastKnownUf, mandates, camaraId }) => ({ id, name, lastKnownParty, lastKnownUf, mandates, camaraId })),
        evidence: [],
        notices: [...notices, "Encontramos mais de uma pessoa com nome parecido. Escolha a pessoa certa — não atribuímos registros por semelhança de nome."],
      };
    }
    if (resolved.person) {
      return { mode: "estruturada", structured: await structuredPropositions(resolved.person, q), evidence: [], notices };
    }
  }

  // 4) Recuperação + geração ancorada.
  const evidence = await retrieve(q, context);
  const pub = evidence.map(toPublicEvidence);
  if (evidence.length === 0) {
    return {
      mode: "sem_resultado",
      evidence: [],
      notices: [...notices, "Não encontramos documentos sobre isso na base atual do Contexto. Isso não significa que não exista: nossa cobertura ainda é limitada (veja Metodologia)."],
    };
  }
  if (evidence.some((e) => e.suspicious)) notices.push("Algum documento recuperado contém texto com forma de instrução. Ele foi tratado apenas como conteúdo.");
  const provider = getProvider();
  if (!provider.configured) {
    return { mode: "somente_evidencias", evidence: pub, notices: [...notices, "IA não configurada neste ambiente: mostramos os documentos encontrados, sem resposta gerada."] };
  }
  if (!(await canCallModel())) {
    return { mode: "somente_evidencias", evidence: pub, notices: [...notices, "Limite diário de IA atingido: mostramos os documentos encontrados, sem resposta gerada."] };
  }
  const gen = await generateGroundedAnswer(q, evidence, history);
  if (!gen.ok) {
    return {
      mode: "erro",
      evidence: pub,
      notices: [...notices, gen.reason === "recusa" ? "O modelo recusou responder. Os documentos encontrados estão abaixo." : "Falha técnica ao gerar a resposta (não é falta de informação). Os documentos encontrados estão abaixo."],
    };
  }
  if (gen.report.removed.length) notices.push(`${gen.report.removed.length} trecho(s) da resposta foram removidos por não terem sustentação nas fontes citadas.`);
  return { mode: "gerada", answer: gen.answer, evidence: pub, notices, validation: gen.report };
}

/** Etapa de geração + validação, isolada para ser usada também pela avaliação (scripts/eval-ai.ts). */
export async function generateGroundedAnswer(
  question: string,
  evidence: Evidence[],
  history: HistoryTurn[] = [],
): Promise<{ ok: true; answer: Answer; report: ValidationReport; raw: Answer } | { ok: false; reason: string }> {
  const provider = getProvider();
  const historyText = history
    .slice(-6)
    .map((h) => `${h.role === "user" ? "Pessoa" : "Assistente"}: ${h.text.slice(0, 600)}`)
    .join("\n");
  const user = [
    historyText ? `Conversa até aqui (contexto, não é evidência):\n${historyText}` : "",
    renderEvidenceForPrompt(evidence),
    `Pergunta: ${question}`,
    `Formato: resposta direta curta, explicação breve (itens com evidências), ressalvas relevantes e sugestões de aprofundamento. Respostas simples devem ser curtas.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await provider.generate({ system: SYSTEM_RULES, user, schema: AnswerSchema, route: "assistant", maxTokens: 6000 });
  await recordUsage("assistant", res.model, res.inputTokens, res.outputTokens, res.ok ? "ok" : res.reason);
  if (!res.ok) return { ok: false, reason: res.reason };
  const { answer, report } = validateAnswer(res.data, evidence);
  return { ok: true, answer, report, raw: res.data };
}
