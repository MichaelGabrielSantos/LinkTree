/**
 * Classificação determinística de etapas legislativas a partir dos códigos de tramitação
 * da Câmara (referencias/proposicoes/codTipoTramitacao, consultado em 2026-10-18).
 *
 * Regra central: nenhuma etapa além de `norma_juridica` significa "virou lei".
 * Aprovação em comissão, em plenário ou remessa ao Senado/sanção são etapas intermediárias.
 */

export type Stage =
  | "apresentada"
  | "em_comissao"
  | "parecer_apresentado"
  | "aprovada_comissao"
  | "rejeitada_comissao"
  | "aprovada_1turno"
  | "aprovada_plenario"
  | "remetida_senado"
  | "remetida_sancao"
  | "remetida_promulgacao"
  | "norma_juridica"
  | "arquivada"
  | "desarquivada"
  | "retirada"
  | "rejeitada"
  | "prejudicada"
  | "outra";

export const STAGE_INFO: Record<Stage, { label: string; explanation: string; isLaw: boolean }> = {
  apresentada: { label: "Apresentada", explanation: "O texto foi protocolado. Apresentar um projeto não muda nenhuma regra.", isLaw: false },
  em_comissao: { label: "Em análise", explanation: "A proposta está sendo encaminhada ou analisada por órgãos da Câmara.", isLaw: false },
  parecer_apresentado: { label: "Parecer apresentado", explanation: "Um relator apresentou parecer. O parecer ainda precisa ser votado.", isLaw: false },
  aprovada_comissao: { label: "Aprovada em comissão", explanation: "Uma comissão aprovou a proposta ou o parecer. Isso não a transforma em lei: ainda há outras etapas.", isLaw: false },
  rejeitada_comissao: { label: "Parecer rejeitado em comissão", explanation: "A comissão rejeitou o parecer do relator naquele momento.", isLaw: false },
  aprovada_1turno: { label: "Aprovada em 1º turno", explanation: "Propostas de emenda à Constituição exigem dois turnos em cada Casa. Ainda falta o 2º turno e o Senado (ou a Câmara, se veio do Senado).", isLaw: false },
  aprovada_plenario: { label: "Aprovada em plenário", explanation: "O plenário de uma Casa aprovou. Normalmente ainda falta a outra Casa e, para leis, a sanção.", isLaw: false },
  remetida_senado: { label: "Enviada ao Senado", explanation: "A Câmara concluiu sua parte e enviou ao Senado, que pode aprovar, alterar ou rejeitar.", isLaw: false },
  remetida_sancao: { label: "Enviada à sanção", explanation: "O Congresso concluiu a votação e enviou à Presidência da República, que pode sancionar ou vetar.", isLaw: false },
  remetida_promulgacao: { label: "Enviada à promulgação", explanation: "Etapa final de formalização (ex.: emendas constitucionais e decretos legislativos). Ainda precisa ser publicada.", isLaw: false },
  norma_juridica: { label: "Transformada em norma jurídica", explanation: "A proposta virou norma. A data de vigência pode ser diferente da data de publicação — confira o texto publicado.", isLaw: true },
  arquivada: { label: "Arquivada", explanation: "A tramitação foi encerrada por arquivamento. Em alguns casos pode ser desarquivada.", isLaw: false },
  desarquivada: { label: "Desarquivada", explanation: "A proposta voltou a tramitar após arquivamento.", isLaw: false },
  retirada: { label: "Retirada pelo autor", explanation: "O autor pediu a retirada da proposta.", isLaw: false },
  rejeitada: { label: "Rejeitada", explanation: "A proposta foi rejeitada na etapa registrada.", isLaw: false },
  prejudicada: { label: "Prejudicada", explanation: "A proposta perdeu o objeto (por exemplo, porque outra decisão tornou a votação desnecessária).", isLaw: false },
  outra: { label: "Movimentação", explanation: "Movimentação administrativa sem mudança de etapa identificada.", isLaw: false },
};

const BY_CODE: Record<string, Stage> = {
  "100": "apresentada",
  "300": "apresentada",
  "128": "remetida_senado",
  "127": "remetida_sancao",
  "609": "remetida_sancao",
  "137": "remetida_sancao",
  "126": "remetida_promulgacao",
  "608": "remetida_promulgacao",
  "251": "norma_juridica",
  "134": "arquivada",
  "502": "arquivada",
  "135": "desarquivada",
  "503": "desarquivada",
  "640": "desarquivada",
  "650": "desarquivada",
  "200": "retirada",
  "197": "rejeitada",
  "198": "prejudicada",
  "435": "prejudicada",
  "237": "aprovada_1turno",
  "238": "aprovada_1turno",
  "322": "parecer_apresentado",
  "323": "parecer_apresentado",
  "325": "parecer_apresentado",
  "326": "parecer_apresentado",
  "340": "parecer_apresentado",
  "335": "rejeitada_comissao",
};

const PLENARIO = new Set(["PLEN", "PLENARIO", "PLENÁRIO"]);

export type TramitacaoInput = {
  codTipoTramitacao?: string | null;
  descricaoTramitacao?: string | null;
  siglaOrgao?: string | null;
  descricaoSituacao?: string | null;
};

export function classifyTramitacao(t: TramitacaoInput): Stage {
  const code = (t.codTipoTramitacao ?? "").trim();
  const orgao = (t.siglaOrgao ?? "").trim().toUpperCase();
  if (BY_CODE[code]) return BY_CODE[code];
  // "Aprovação" genérica / do parecer: depende de onde ocorreu.
  if (code === "336" || code === "240" || code === "244" || code === "239") {
    return PLENARIO.has(orgao) ? "aprovada_plenario" : "aprovada_comissao";
  }
  const desc = (t.descricaoTramitacao ?? "").toLowerCase();
  if (desc.includes("transformação em norma") || desc.includes("transformado em norma")) return "norma_juridica";
  if (desc.startsWith("arquivamento")) return "arquivada";
  if (desc.includes("remessa ao senado")) return "remetida_senado";
  if (desc.includes("remessa à sanção")) return "remetida_sancao";
  return orgao && !PLENARIO.has(orgao) && orgao !== "MESA" ? "em_comissao" : "outra";
}

/**
 * Situação atual a partir de `statusProposicao.descricaoSituacao` (texto da fonte) e,
 * na falta dele, da última tramitação. Mantém o texto original para exibição.
 */
export function currentStage(situacao: string | null | undefined, last: TramitacaoInput | null): Stage {
  const s = (situacao ?? "").toLowerCase();
  if (s.includes("transformado em norma") || s.includes("transformada em norma")) return "norma_juridica";
  if (s.includes("transformado em lei")) return "norma_juridica";
  if (s.startsWith("arquivada")) return "arquivada";
  if (s.includes("aguardando sanção")) return "remetida_sancao";
  if (s.includes("aguardando promulgação")) return "remetida_promulgacao";
  if (s.includes("senado federal")) return "remetida_senado";
  if (s.includes("retirado pelo autor") || s.includes("retirada pelo autor")) return "retirada";
  if (s.includes("vetado totalmente")) return "rejeitada";
  if (last) return classifyTramitacao(last);
  return s ? "em_comissao" : "apresentada";
}

/** Tipos que podem virar norma. Requerimentos, indicações etc. são tratados à parte. */
export const NORM_PROPOSAL_TYPES = new Set(["PL", "PLP", "PEC", "PDL", "PLV", "MPV", "PRC", "PLN"]);

export const PROPOSAL_TYPE_LABEL: Record<string, string> = {
  PL: "Projeto de Lei",
  PLP: "Projeto de Lei Complementar",
  PEC: "Proposta de Emenda à Constituição",
  PDL: "Projeto de Decreto Legislativo",
  MPV: "Medida Provisória",
  PLV: "Projeto de Lei de Conversão",
  PRC: "Projeto de Resolução",
  REQ: "Requerimento",
  RIC: "Requerimento de Informação",
  INC: "Indicação",
  EMC: "Emenda na Comissão",
  EMP: "Emenda de Plenário",
  SBT: "Substitutivo",
  PRL: "Parecer de Relator",
  PAR: "Parecer de Comissão",
  DTQ: "Destaque",
};

export function typeGroup(sigla: string): "norma" | "requerimento" | "emenda_parecer" | "outro" {
  if (NORM_PROPOSAL_TYPES.has(sigla)) return "norma";
  if (["REQ", "RIC", "INC", "RCP", "REL", "SIT"].includes(sigla)) return "requerimento";
  if (["EMC", "EMP", "EMA", "EMS", "SBT", "SBE", "PRL", "PAR", "PPP", "DTQ", "ESB", "EMR"].includes(sigla)) return "emenda_parecer";
  return "outro";
}

/** Etapas simplificadas para a barra de progresso dos cards e da página do projeto. */
export const PIPELINE: Array<{ key: string; label: string; stages: Stage[] }> = [
  { key: "apr", label: "Apresentação", stages: ["apresentada"] },
  { key: "com", label: "Comissões", stages: ["em_comissao", "parecer_apresentado", "aprovada_comissao", "rejeitada_comissao", "outra", "desarquivada"] },
  { key: "ple", label: "Plenário", stages: ["aprovada_1turno", "aprovada_plenario"] },
  { key: "sen", label: "Outra Casa", stages: ["remetida_senado"] },
  { key: "san", label: "Sanção ou promulgação", stages: ["remetida_sancao", "remetida_promulgacao"] },
  { key: "lei", label: "Virou norma", stages: ["norma_juridica"] },
];

export const TERMINAL_STAGES: Stage[] = ["arquivada", "retirada", "rejeitada", "prejudicada"];

export function pipelineIndex(stage: Stage): number {
  return PIPELINE.findIndex((p) => p.stages.includes(stage));
}

/** Rótulo curto e tom visual para cards. O tom sempre acompanha texto + ícone (nunca só cor). */
export function stageBadge(stage: Stage): { label: string; tone: "ok" | "neutral" | "accent"; icon: string } {
  if (stage === "norma_juridica") return { label: "Virou norma", tone: "ok", icon: "✓" };
  if (stage === "arquivada") return { label: "Arquivado", tone: "neutral", icon: "■" };
  if (stage === "retirada") return { label: "Retirado pelo autor", tone: "neutral", icon: "■" };
  if (stage === "rejeitada") return { label: "Rejeitado", tone: "neutral", icon: "■" };
  if (stage === "prejudicada") return { label: "Prejudicado", tone: "neutral", icon: "■" };
  if (stage === "remetida_senado") return { label: "No Senado", tone: "accent", icon: "●" };
  if (stage === "remetida_sancao") return { label: "Aguardando sanção", tone: "accent", icon: "●" };
  if (stage === "remetida_promulgacao") return { label: "Aguardando promulgação", tone: "accent", icon: "●" };
  if (stage === "aprovada_plenario" || stage === "aprovada_1turno") return { label: "Aprovado no plenário", tone: "accent", icon: "●" };
  if (stage === "aprovada_comissao") return { label: "Aprovado em comissão", tone: "accent", icon: "●" };
  if (stage === "apresentada") return { label: "Recém-apresentado", tone: "accent", icon: "●" };
  return { label: "Em análise", tone: "accent", icon: "●" };
}
