import { normalizeForMatch } from "@/lib/text";

/**
 * Glossário editorial do Contexto: explicações gerais sobre procedimentos, escritas e revisáveis pela equipe.
 * Não descrevem acontecimentos atuais e não servem de prova sobre casos concretos.
 * Base: Constituição Federal (arts. 59–69) e Regimento Interno da Câmara. Revisão jurídica pendente.
 */
export type GlossaryEntry = { slug: string; term: string; aliases: string[]; short: string; long: string; reference?: string };

export const GLOSSARY_VERSION = "glossario-2026-10-18";

export const GLOSSARY: GlossaryEntry[] = [
  {
    slug: "apresentar-vs-aprovar",
    term: "Apresentar um projeto × aprovar uma lei",
    aliases: ["apresentar e aprovar", "diferenca entre apresentar", "apresentado e aprovado", "projeto e lei", "virou lei"],
    short: "Apresentar é protocolar uma proposta; nada muda até que ela seja aprovada nas etapas exigidas e vire norma publicada.",
    long:
      "Qualquer parlamentar pode apresentar (protocolar) um projeto. A partir daí ele tramita: passa por comissões, pode ir ao plenário, precisa ser aprovado pela Câmara e pelo Senado e, no caso de leis, ser sancionado pela Presidência da República (que pode vetar total ou parcialmente). Só depois de publicada a lei passa a existir, e ela pode ter uma data de vigência posterior. Muitos projetos apresentados nunca chegam a ser votados.",
    reference: "Constituição Federal, arts. 61, 64–66",
  },
  {
    slug: "comissao",
    term: "Comissão",
    aliases: ["comissao", "comissoes", "aprovado em comissao"],
    short: "Grupo de parlamentares que analisa propostas de um tema antes (ou em vez) do plenário.",
    long:
      "As comissões examinam os projetos por tema (saúde, educação, constituição e justiça etc.). Em alguns casos (apreciação conclusiva), a aprovação nas comissões dispensa o plenário da Câmara, mas a proposta ainda segue para o Senado e, se for lei, para sanção. Aprovação em comissão nunca significa que a proposta virou lei.",
    reference: "Constituição Federal, art. 58; Regimento Interno da Câmara, art. 24",
  },
  {
    slug: "plenario",
    term: "Plenário",
    aliases: ["plenario"],
    short: "Reunião de todos os membros de uma Casa (Câmara ou Senado) para votar.",
    long: "O plenário reúne todos os deputados (ou senadores). Uma aprovação no plenário da Câmara ainda depende do Senado, e vice-versa.",
  },
  {
    slug: "sancao-veto",
    term: "Sanção e veto",
    aliases: ["sancao", "veto", "sancionado", "vetado"],
    short: "Depois do Congresso, a Presidência da República aprova (sanciona) ou rejeita (veta) o projeto de lei.",
    long:
      "Aprovado pelas duas Casas, o projeto de lei vai à Presidência da República, que tem 15 dias úteis para sancionar ou vetar, total ou parcialmente. O Congresso pode derrubar o veto. Emendas à Constituição não passam por sanção: são promulgadas pelo próprio Congresso.",
    reference: "Constituição Federal, art. 66",
  },
  {
    slug: "promulgacao-vigencia",
    term: "Promulgação, publicação e vigência",
    aliases: ["promulgacao", "promulgada", "vigencia", "entra em vigor", "publicacao"],
    short: "Promulgar declara a norma; publicar a torna conhecida; vigência é quando ela passa a valer.",
    long: "A norma é promulgada e publicada no Diário Oficial. A data em que passa a valer (vigência) pode ser a da publicação ou outra indicada no próprio texto.",
  },
  {
    slug: "pl-plp-pec",
    term: "PL, PLP e PEC",
    aliases: ["pl", "plp", "pec", "projeto de lei complementar", "emenda constitucional", "proposta de emenda"],
    short: "PL cria ou altera lei comum; PLP trata de temas que a Constituição reserva a lei complementar; PEC altera a Constituição.",
    long:
      "Um Projeto de Lei (PL) precisa de maioria simples dos presentes. Um Projeto de Lei Complementar (PLP) exige maioria absoluta. Uma Proposta de Emenda à Constituição (PEC) precisa de 3/5 dos votos em dois turnos em cada Casa e não passa por sanção.",
    reference: "Constituição Federal, arts. 60, 69",
  },
  {
    slug: "relator",
    term: "Relator(a)",
    aliases: ["relator", "relatora", "relatoria", "parecer"],
    short: "Parlamentar designado para analisar a proposta e apresentar um parecer recomendando aprovar, rejeitar ou mudar o texto.",
    long: "Ser relator é diferente de ser autor. O parecer do relator ainda precisa ser votado pela comissão ou pelo plenário.",
  },
  {
    slug: "requerimento-destaque",
    term: "Requerimento, destaque e substitutivo",
    aliases: ["requerimento", "destaque", "substitutivo", "emenda", "apensado", "apensados"],
    short: "Requerimento pede um procedimento; destaque separa um trecho para votação própria; substitutivo é um texto alternativo inteiro.",
    long:
      "Em uma mesma sessão, pode haver votações de requerimentos (ex.: adiar, pedir urgência), do texto principal e de destaques. Um voto 'não' em um requerimento não é um voto contra a proposta principal. Projetos apensados tramitam juntos com um projeto principal.",
  },
  {
    slug: "votacao-nominal-simbolica",
    term: "Votação nominal × simbólica",
    aliases: ["votacao nominal", "votacao simbolica", "como votou", "voto"],
    short: "Na votação nominal cada voto é registrado; na simbólica só o resultado é registrado.",
    long:
      "Só votações nominais permitem saber como cada parlamentar votou. Em votações simbólicas não há voto individual registrado, e a falta de registro de voto não significa ausência nem oposição. (A integração de votações está prevista para o próximo incremento do Contexto.)",
  },
  {
    slug: "legislatura-suplente",
    term: "Legislatura e suplente",
    aliases: ["legislatura", "suplente", "titular", "mandato"],
    short: "Legislatura é o período de 4 anos de mandato na Câmara; suplente assume quando o titular se afasta.",
    long: "A 57ª legislatura vai de 01/02/2023 a 31/01/2027. Um suplente pode exercer o mandato por períodos, o que afeta contagens de atuação.",
  },
];

export function findGlossaryEntries(question: string, max = 2): GlossaryEntry[] {
  const q = ` ${normalizeForMatch(question)} `;
  const scored = GLOSSARY.map((g) => {
    // Só frase/palavra inteira: "pl" não pode casar com "explique".
    const hits = [g.term, ...g.aliases].filter((a) => q.includes(` ${normalizeForMatch(a)} `)).length;
    return { g, hits };
  }).filter((s) => s.hits > 0);
  return scored.sort((a, b) => b.hits - a.hits).slice(0, max).map((s) => s.g);
}

/** A pergunta é sobre um conceito (e não sobre um caso concreto)? */
export function isConceptQuestion(question: string): boolean {
  const q = normalizeForMatch(question);
  return /^(qual (e )?a diferenca|o que (e|significa)|como funciona|o que quer dizer|explique o que)/.test(q) && findGlossaryEntries(question).length > 0;
}
