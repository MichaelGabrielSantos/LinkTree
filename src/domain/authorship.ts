/**
 * Papéis de autoria segundo os dados da Câmara (verificado em 2026-10-18 nos arquivos anuais):
 * - `proponente = 1` vale para TODOS os autores do texto; `ordemAssinatura` 1 é o primeiro signatário.
 * - `proponente = 0` é apoiamento (assinatura de apoio, comum em requerimentos), não autoria.
 * - Vínculos vindos da listagem por deputado na API não trazem esses campos → papel não verificado.
 */
export type AuthorRole = "autoria" | "coautoria" | "apoio" | "nao_verificado";

export const AUTHOR_ROLES: AuthorRole[] = ["autoria", "coautoria", "apoio", "nao_verificado"];

export const ROLE_LABEL: Record<AuthorRole, string> = {
  autoria: "Autoria (1º signatário)",
  coautoria: "Coautoria",
  apoio: "Apoiamento",
  nao_verificado: "Papel não verificado",
};

export const ROLE_HELP: Record<AuthorRole, string> = {
  autoria: "Primeira pessoa a assinar a proposta.",
  coautoria: "Também é autora, assinando depois do primeiro signatário.",
  apoio: "Assinou em apoio; não é autora do texto.",
  nao_verificado: "Vínculo de autoria sem ordem de assinatura ou indicação de proponente na fonte.",
};

export function roleOf(proponent: boolean | null, signatureOrder: number | null): AuthorRole {
  if (proponent === false) return "apoio";
  if (proponent === true && signatureOrder === 1) return "autoria";
  if (proponent === true && signatureOrder != null && signatureOrder > 1) return "coautoria";
  return "nao_verificado";
}
