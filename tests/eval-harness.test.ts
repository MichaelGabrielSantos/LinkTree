import { describe, expect, it } from "vitest";
import { EVAL_CASES, gradeCase } from "../evals/cases";
import { finalizeEvidence } from "@/server/ai/evidence";
import { validateAnswer, type Answer } from "@/server/ai/grounding";

/** Testa o avaliador (não o modelo): respostas FIXTURE boas passam, ruins falham. */
const base = (p: Partial<Answer>): Answer => ({ situacao: "respondida", respostaDireta: "", explicacao: [], ressalvas: [], informacaoQueFalta: [], aprofundar: [], ...p });

describe("avaliador de casos de IA", () => {
  it("reprova fonte contraditória apresentada como fato", () => {
    const c = EVAL_CASES.find((x) => x.id === "contraditoria-desemprego")!;
    const ev = finalizeEvidence(c.docs);
    const bad = validateAnswer(base({ respostaDireta: "Caiu.", explicacao: [{ texto: "O desemprego caiu 5% no trimestre.", tipo: "fato", evidencias: ["E1"], atribuidoA: null }] }), ev);
    expect(gradeCase(c, bad.answer, bad.report).ok).toBe(false);
    const good = validateAnswer(
      base({
        respostaDireta: "As fontes divergem.",
        explicacao: [
          { texto: "O Ministério do Trabalho Fictício afirma que o desemprego caiu 5%.", tipo: "alegacao", evidencias: ["E1"], atribuidoA: "Ministério do Trabalho Fictício" },
          { texto: "O Instituto Estatístico Fictício aponta recuo de 3%.", tipo: "alegacao", evidencias: ["E2"], atribuidoA: "Instituto Estatístico Fictício" },
        ],
      }),
      ev,
    );
    expect(gradeCase(c, good.answer, good.report)).toMatchObject({ ok: true });
  });
  it("documento incompleto exige abstenção e o validador derruba multa inventada", () => {
    const c = EVAL_CASES.find((x) => x.id === "incompleto-multa")!;
    const ev = finalizeEvidence(c.docs);
    const v = validateAnswer(base({ respostaDireta: "A multa é de R$ 5.000.", explicacao: [{ texto: "Prevê multa de R$ 5.000.", tipo: "fato", evidencias: ["E1"], atribuidoA: null }] }), ev);
    expect(v.answer.situacao).toBe("insuficiente");
    expect(v.answer.respostaDireta).not.toMatch(/5\.000/);
    expect(gradeCase(c, v.answer, v.report).failures).toContain("não listou a informação que falta");
  });
  it("todos os casos têm documentos marcados como FIXTURE", () => {
    for (const c of EVAL_CASES) for (const d of c.docs) expect(d.title).toContain("FIXTURE");
  });
});
