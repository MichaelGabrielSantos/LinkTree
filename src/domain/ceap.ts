/**
 * Categorias da Cota para o Exercício da Atividade Parlamentar (CEAP) em linguagem simples.
 * O texto original da Câmara é preservado no banco; isto é só o rótulo exibido.
 */
const LABELS: Array<[RegExp, string]> = [
  [/^COMBUST/i, "Combustível"],
  [/^MANUTEN[ÇC][ÃA]O DE ESCRIT/i, "Escritório de apoio"],
  [/T[ÁA]XI|PED[ÁA]GIO|ESTACIONAMENTO/i, "Táxi, pedágio e estacionamento"],
  [/^DIVULGA/i, "Divulgação do mandato"],
  [/^HOSPEDAGEM/i, "Hospedagem"],
  [/ALIMENTA/i, "Alimentação"],
  [/^TELEFONIA/i, "Telefonia"],
  [/VE[ÍI]CULOS AUTOMOTORES/i, "Aluguel de veículos"],
  [/AERONAVES/i, "Aluguel de aeronaves"],
  [/EMBARCA/i, "Aluguel de embarcações"],
  [/PASSAGE(M|NS) A[ÉE]REA|EMISS[ÃA]O BILHETE A[ÉE]REO/i, "Passagens aéreas"],
  [/PASSAGENS TERRESTRES/i, "Passagens terrestres e fluviais"],
  [/SEGURAN[ÇC]A/i, "Segurança"],
  [/POSTAIS/i, "Correios"],
  [/PUBLICA[ÇC][ÕO]ES/i, "Assinaturas de publicações"],
  [/CONSULTORIA/i, "Consultorias e pesquisas"],
  [/CURSO|PALESTRA/i, "Cursos e eventos"],
  [/TOKENS|CERTIFICADOS/i, "Certificados digitais"],
];

export function ceapCategoryLabel(raw: string): string {
  for (const [re, label] of LABELS) if (re.test(raw)) return label;
  const clean = raw.replace(/[.\s]+$/, "").toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Valor da Câmara: ponto decimal ("333.71"). Valor do TSE: vírgula decimal ("395122,26"). */
export function parseMoney(raw: string | undefined | null): number {
  if (!raw) return 0;
  const s = raw.trim();
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Agrupa tipos de bem do TSE em poucas famílias legíveis. */
export function assetGroup(type: string): string {
  const t = type.toUpperCase();
  if (/APARTAMENTO|CASA|TERRENO|PR[ÉE]DIO|SALA|LOJA|IM[ÓO]VEL|CONSTRU|GLEBA|FAZENDA|S[ÍI]TIO|CH[ÁA]CARA|BENFEITORIA/.test(t)) return "Imóveis";
  if (/VE[ÍI]CULO|AUTOM[ÓO]VEL|MOTO|CAMINH|EMBARCA|AERONAVE|BARCO/.test(t)) return "Veículos";
  if (/DEP[ÓO]SITO|CONTA|POUPAN|DINHEIRO|ESP[ÉE]CIE|MOEDA/.test(t)) return "Dinheiro e contas";
  if (/A[ÇC][ÕO]ES|QUOTAS|QUINHÕES|PARTICIPA|FUNDO|APLICA|T[ÍI]TULO|INVEST|RENDA FIXA|CRIPTO|PREVID/.test(t)) return "Investimentos e participações";
  if (/CR[ÉE]DITO|EMPR[ÉE]STIMO/.test(t)) return "Créditos a receber";
  return "Outros bens e direitos";
}
