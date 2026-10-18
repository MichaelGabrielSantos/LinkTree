import { describe, expect, it } from "vitest";
import { extractNumbers, isLoadedQuestion, validateAnswer, validateExplanation, type Answer } from "@/server/ai/grounding";
import { finalizeEvidence, looksLikeInjection, renderEvidenceForPrompt, type Evidence } from "@/server/ai/evidence";
import { INJECTION_BODY } from "./fixtures/rss";

const ev = (text: string, title = "Doc"): Omit<Evidence, "ref"> => ({
  kind: "noticia",
  title,
  sourceName: "FIXTURE",
  url: "https://example.org/x",
  date: "2026-10-17T12:00:00.000Z",
  collectedAt: null,
  versionHash: "h",
  text,
  recordType: "news",
  recordId: "00000000-0000-0000-0000-000000000000",
});

const evidence = finalizeEvidence([ev("A prefeitura anunciou reforma de 12 escolas com investimento estimado de R$ 30 milhões."), ev("Sindicato afirma que o valor é insuficiente.")]);

const answer = (explicacao: Answer["explicacao"], extra: Partial<Answer> = {}): Answer => ({
  situacao: "respondida",
  respostaDireta: "A prefeitura anunciou uma reforma.",
  explicacao,
  ressalvas: [],
  informacaoQueFalta: [],
  aprofundar: [],
  ...extra,
});

describe("validação de citações", () => {
  it("remove referência inexistente e item sem evidência", () => {
    const { answer: a, report } = validateAnswer(
      answer([
        { texto: "A reforma envolve escolas.", tipo: "fato", evidencias: ["E1", "E9"], atribuidoA: null },
        { texto: "Sem fonte nenhuma.", tipo: "fato", evidencias: ["E7"], atribuidoA: null },
      ]),
      evidence,
    );
    expect(a.explicacao).toHaveLength(1);
    expect(a.explicacao[0].evidencias).toEqual(["E1"]);
    expect(report.unknownRefs).toEqual(["E9", "E7"]);
  });
  it("remove número que não aparece na fonte citada", () => {
    const { answer: a, report } = validateAnswer(
      answer([
        { texto: "São 12 escolas.", tipo: "fato", evidencias: ["E1"], atribuidoA: null },
        { texto: "O investimento é de R$ 45 milhões.", tipo: "fato", evidencias: ["E1"], atribuidoA: null },
        { texto: "São 12 escolas, diz o sindicato.", tipo: "alegacao", evidencias: ["E2"], atribuidoA: "Sindicato" },
      ]),
      evidence,
    );
    expect(a.explicacao.map((c) => c.texto)).toEqual(["São 12 escolas."]);
    expect(report.removed.map((r) => r.motivo).join(" ")).toContain("45");
  });
  it("alegação sem atribuição é removida", () => {
    const { answer: a } = validateAnswer(answer([{ texto: "O valor é insuficiente.", tipo: "alegacao", evidencias: ["E2"], atribuidoA: " " }]), evidence);
    expect(a.situacao).toBe("insuficiente");
  });
  it("sem nenhum fato sustentado, a resposta vira abstenção", () => {
    const { answer: a, report } = validateAnswer(answer([{ texto: "Talvez melhore.", tipo: "interpretacao", evidencias: ["E1"], atribuidoA: null }]), evidence);
    expect(a.situacao).toBe("insuficiente");
    expect(report.downgradedToInsufficient).toBe(true);
  });
  it("remove URLs escritas pelo modelo", () => {
    const { answer: a } = validateAnswer(answer([{ texto: "Veja https://inventado.example/abc a reforma de escolas.", tipo: "fato", evidencias: ["E1"], atribuidoA: null }]), evidence);
    expect(a.explicacao[0].texto).not.toContain("http");
  });
  it("resposta direta com número inventado é substituída", () => {
    const { answer: a } = validateAnswer(
      answer([{ texto: "Há reforma.", tipo: "fato", evidencias: ["E1"], atribuidoA: null }], { respostaDireta: "Serão 40 escolas." }),
      evidence,
    );
    expect(a.respostaDireta).not.toContain("40");
  });
  it("simplificação preserva a classificação: projeção continua projeção", () => {
    const { explanation } = validateExplanation(
      {
        situacao: "respondida",
        resumo: "Reforma de escolas.",
        secoes: [
          { chave: "o_que_aconteceu", titulo: "O que aconteceu", itens: [{ texto: "Anunciaram reforma de 12 escolas.", tipo: "fato", evidencias: ["E1"], atribuidoA: null }] },
          { chave: "por_que_importa", titulo: "Por que importa", itens: [{ texto: "O custo estimado é R$ 30 milhões.", tipo: "projecao", evidencias: ["E1"], atribuidoA: null }] },
          { chave: "vazia", titulo: "Vazia", itens: [] },
        ],
        termos: [],
        ressalvas: [],
        informacaoQueFalta: [],
      },
      evidence,
    );
    expect(explanation.secoes.map((s) => s.chave)).toEqual(["o_que_aconteceu", "por_que_importa"]);
    expect(explanation.secoes[1].itens[0].tipo).toBe("projecao");
  });
  it("extrai números normalizados", () => {
    expect(extractNumbers("R$ 1.500,50 e 12 escolas, 1º turno")).toEqual(["1500,50", "12"]);
  });
});

describe("prompt injection", () => {
  it("detecta e neutraliza texto com forma de instrução", () => {
    expect(looksLikeInjection(INJECTION_BODY)).toBe(true);
    const [e] = finalizeEvidence([ev(INJECTION_BODY)]);
    expect(e.suspicious).toBe(true);
    const rendered = renderEvidenceForPrompt([e]);
    // O documento não consegue fechar o envelope de dados nem abrir um bloco <system>.
    expect(rendered.match(/<\/evidencias>/g)).toHaveLength(1);
    expect(rendered).not.toMatch(/<system>/i);
    expect(rendered).toContain('alerta="contém texto com forma de instrução');
  });
  it("texto jornalístico comum não é marcado", () => {
    expect(looksLikeInjection("O ministro disse que vai ignorar as críticas da oposição.")).toBe(false);
  });
});

describe("perguntas carregadas", () => {
  it("detecta julgamento sobre pessoa", () => {
    expect(isLoadedQuestion("Fulano é contra a educação?")).toBe(true);
    expect(isLoadedQuestion("Beltrana é corrupta?")).toBe(true);
    expect(isLoadedQuestion("Quais projetos Fulano apresentou sobre educação?")).toBe(false);
  });
});

describe("números de data", () => {
  it("dia/mês da publicação só valem quando o item cita uma data", () => {
    const { answer: a } = validateAnswer(
      answer([
        { texto: "Foram 17 escolas.", tipo: "fato", evidencias: ["E1"], atribuidoA: null },
        { texto: "O anúncio saiu em 17 de outubro de 2026.", tipo: "fato", evidencias: ["E1"], atribuidoA: null },
      ]),
      evidence,
    );
    expect(a.explicacao.map((c) => c.texto)).toEqual(["O anúncio saiu em 17 de outubro de 2026."]);
  });
});
