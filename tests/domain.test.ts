import { describe, expect, it } from "vitest";
import { classifyTramitacao, currentStage, STAGE_INFO, typeGroup } from "@/domain/legislative-stage";
import { rankPanorama, scoreItem } from "@/domain/ranking";
import { partyAt, partyTimeline } from "@/domain/party-timeline";
import { titleSimilarity, assignCluster } from "@/domain/clustering";
import { findGlossaryEntries, isConceptQuestion } from "@/domain/glossary";
import { parsePropositionIdentifier, orQuery } from "@/server/queries/search";
import { stableHash } from "@/lib/hash";
import { roleOf } from "@/domain/authorship";

describe("etapas legislativas", () => {
  it("aprovação em comissão não é lei", () => {
    const s = classifyTramitacao({ codTipoTramitacao: "336", siglaOrgao: "CCJC", descricaoTramitacao: "Aprovação do Parecer" });
    expect(s).toBe("aprovada_comissao");
    expect(STAGE_INFO[s].isLaw).toBe(false);
  });
  it("mesma aprovação no plenário é etapa de plenário, ainda não lei", () => {
    const s = classifyTramitacao({ codTipoTramitacao: "240", siglaOrgao: "PLEN" });
    expect(s).toBe("aprovada_plenario");
    expect(STAGE_INFO[s].isLaw).toBe(false);
  });
  it("remessa ao Senado e à sanção não são lei", () => {
    expect(STAGE_INFO[classifyTramitacao({ codTipoTramitacao: "128" })].isLaw).toBe(false);
    expect(STAGE_INFO[classifyTramitacao({ codTipoTramitacao: "609" })].isLaw).toBe(false);
  });
  it("só transformação em norma jurídica é lei", () => {
    expect(classifyTramitacao({ codTipoTramitacao: "251" })).toBe("norma_juridica");
    const lawStages = Object.entries(STAGE_INFO).filter(([, v]) => v.isLaw).map(([k]) => k);
    expect(lawStages).toEqual(["norma_juridica"]);
  });
  it("situação textual da Câmara prevalece", () => {
    expect(currentStage("Aguardando Apreciação pelo Senado Federal", null)).toBe("remetida_senado");
    expect(currentStage("Transformado em Norma Jurídica", null)).toBe("norma_juridica");
    expect(currentStage("Arquivada", { codTipoTramitacao: "336", siglaOrgao: "CCJC" })).toBe("arquivada");
    expect(currentStage(null, { codTipoTramitacao: "336", siglaOrgao: "CE" })).toBe("aprovada_comissao");
  });
  it("requerimento e destaque não são projetos de norma", () => {
    expect(typeGroup("REQ")).toBe("requerimento");
    expect(typeGroup("DTQ")).toBe("emenda_parecer");
    expect(typeGroup("PL")).toBe("norma");
  });
});

describe("ordenação do panorama", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const base = { clusterSize: 1, sourceCount: 1, topicWeight: 1, availableTextChars: 1500 };
  it("é determinística e não recebe dados pessoais", () => {
    const items = [
      { id: "a", topicSlug: "politica", publishedAt: new Date("2026-10-18T10:00:00Z"), ...base },
      { id: "b", topicSlug: "politica", publishedAt: new Date("2026-10-18T10:00:00Z"), ...base },
      { id: "c", topicSlug: "saude", publishedAt: new Date("2026-10-18T09:00:00Z"), ...base },
    ];
    const r1 = rankPanorama(items, now).map((x) => x.id);
    const r2 = rankPanorama([...items].reverse(), now).map((x) => x.id);
    expect(r1).toEqual(r2);
    // Função só recebe atributos dos itens: assinatura não aceita usuário/posicionamento.
    expect(rankPanorama.length).toBe(2);
  });
  it("aplica diversidade temática", () => {
    const items = [
      { id: "p1", topicSlug: "politica", publishedAt: new Date("2026-10-18T11:00:00Z"), ...base },
      { id: "p2", topicSlug: "politica", publishedAt: new Date("2026-10-18T11:00:00Z"), ...base },
      { id: "s1", topicSlug: "saude", publishedAt: new Date("2026-10-18T10:00:00Z"), ...base },
    ];
    expect(rankPanorama(items, now).map((x) => x.id)).toEqual(["p1", "s1", "p2"]);
  });
  it("matéria com mais evidência disponível pontua mais", () => {
    const a = scoreItem({ id: "a", topicSlug: null, publishedAt: now, ...base, availableTextChars: 100 }, now);
    const b = scoreItem({ id: "b", topicSlug: null, publishedAt: now, ...base, availableTextChars: 1500 }, now);
    expect(b.base).toBeGreaterThan(a.base);
  });
});

describe("histórico partidário", () => {
  const ev = [
    { at: new Date("2019-02-01"), party: "PDT", uf: "SP", legislature: 56, description: null },
    { at: new Date("2021-09-28"), party: "PSB", uf: "SP", legislature: 56, description: null },
    { at: new Date("2023-02-01"), party: "PSB", uf: "SP", legislature: 57, description: null },
  ];
  it("não aplica o partido atual a datas antigas", () => {
    const seg = partyTimeline(ev);
    expect(seg.map((s) => s.party)).toEqual(["PDT", "PSB"]);
    expect(partyAt(seg, new Date("2020-06-01"))).toBe("PDT");
    expect(partyAt(seg, new Date("2024-01-01"))).toBe("PSB");
    expect(partyAt(seg, new Date("2010-01-01"))).toBeNull();
  });
});

describe("agrupamento", () => {
  it("agrupa títulos muito parecidos e separa diferentes", () => {
    expect(titleSimilarity("Banco Central mantém taxa Selic em 15% ao ano", "Banco Central mantém Selic em 15% ao ano pela terceira vez")).toBeGreaterThanOrEqual(0.5);
    expect(titleSimilarity("Banco Central mantém taxa Selic", "Chuvas provocam alagamentos no interior paulista")).toBe(0);
    expect(assignCluster("Chuvas provocam alagamentos", [{ id: "1", title: "Selic mantida pelo Copom", clusterId: 3 }])).toBeNull();
  });
});

describe("pesquisa e glossário", () => {
  it("reconhece identificação oficial", () => {
    expect(parsePropositionIdentifier("o que é o PL 5498/2026?")).toEqual({ siglaTipo: "PL", numero: 5498, ano: 2026 });
    expect(parsePropositionIdentifier("pec 45 de 2019")).toEqual({ siglaTipo: "PEC", numero: 45, ano: 2019 });
  });
  it("consulta OR ignora palavras de pergunta", () => {
    expect(orQuery("O que aconteceu hoje na economia?")).toBe("economia");
    expect(orQuery("o que é?")).toBeNull();
  });
  it("glossário só casa palavras inteiras", () => {
    expect(findGlossaryEntries("explique isso").map((g) => g.slug)).not.toContain("pl-plp-pec");
    expect(isConceptQuestion("Qual é a diferença entre apresentar um projeto e aprovar uma lei?")).toBe(true);
    expect(isConceptQuestion("Quais projetos Tabata Amaral apresentou?")).toBe(false);
  });
  it("hash estável independe da ordem das chaves", () => {
    expect(stableHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(stableHash({ b: [1, { d: 3, c: 2 }], a: 1 }));
  });
});

describe("papéis de autoria", () => {
  it("proponente com ordem > 1 é coautoria; proponente = 0 é apoiamento", () => {
    expect(roleOf(true, 1)).toBe("autoria");
    expect(roleOf(true, 4)).toBe("coautoria");
    expect(roleOf(false, 2)).toBe("apoio");
    expect(roleOf(null, null)).toBe("nao_verificado");
    expect(roleOf(true, null)).toBe("nao_verificado");
  });
});
