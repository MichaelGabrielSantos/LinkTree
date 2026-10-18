import { z } from "zod";
import { assertAllowedUrl, fetchJson, fetchWithRetry, HttpError, readLimited } from "../http";

/** Documentação verificada: https://dadosabertos.camara.leg.br/swagger/api.html (OpenAPI 3.0.1, 2026-10-18). */
export const CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2";
export const CAMARA_FILES = "https://dadosabertos.camara.leg.br/arquivos";

const nullableStr = z.string().nullish().transform((v) => v ?? null);
const numOrStr = z.union([z.number(), z.string()]).transform((v) => String(v));

export const DeputadoListItem = z.object({
  id: z.number(),
  nome: z.string(),
  siglaPartido: nullableStr,
  siglaUf: nullableStr,
  idLegislatura: z.number(),
  urlFoto: nullableStr,
});

export const DeputadoDetail = z.object({
  id: z.number(),
  nomeCivil: nullableStr,
  ultimoStatus: z.object({
    nome: z.string(),
    siglaPartido: nullableStr,
    siglaUf: nullableStr,
    idLegislatura: z.number().nullish(),
    urlFoto: nullableStr,
    data: nullableStr,
    situacao: nullableStr,
    condicaoEleitoral: nullableStr,
  }),
  // CPF, data de nascimento, redes sociais etc. existem na resposta e são descartados de propósito.
});

export const HistoricoItem = z.object({
  nome: nullableStr,
  siglaPartido: nullableStr,
  siglaUf: nullableStr,
  idLegislatura: z.number().nullish(),
  dataHora: z.string(),
  situacao: nullableStr,
  condicaoEleitoral: nullableStr,
  descricaoStatus: nullableStr,
});

export const ProposicaoListItem = z.object({
  id: z.number(),
  siglaTipo: z.string(),
  numero: z.number(),
  ano: z.number(),
  ementa: z.string().nullish().transform((v) => v ?? ""),
  dataApresentacao: nullableStr,
});

export const ProposicaoDetail = z.object({
  id: z.number(),
  siglaTipo: z.string(),
  numero: z.number(),
  ano: z.number(),
  descricaoTipo: nullableStr,
  ementa: z.string().nullish().transform((v) => v ?? ""),
  ementaDetalhada: nullableStr,
  keywords: nullableStr,
  dataApresentacao: nullableStr,
  urlInteiroTeor: nullableStr,
  uriPropPrincipal: nullableStr,
  statusProposicao: z
    .object({
      dataHora: nullableStr,
      siglaOrgao: nullableStr,
      uriUltimoRelator: nullableStr,
      regime: nullableStr,
      descricaoTramitacao: nullableStr,
      codTipoTramitacao: nullableStr,
      descricaoSituacao: nullableStr,
      codSituacao: z.union([z.number(), z.string()]).nullish().transform((v) => (v == null ? null : String(v))),
      despacho: nullableStr,
      apreciacao: nullableStr,
    })
    .nullish(),
});

export const AutorItem = z.object({
  uri: nullableStr,
  nome: z.string(),
  codTipo: z.number().nullish(),
  tipo: nullableStr,
  ordemAssinatura: z.number().nullish(),
  proponente: z.number().nullish(),
});

export const TemaItem = z.object({ codTema: z.number(), tema: z.string(), relevancia: z.number().nullish() });

export const TramitacaoItem = z.object({
  dataHora: z.string(),
  sequencia: z.number(),
  siglaOrgao: nullableStr,
  regime: nullableStr,
  descricaoTramitacao: nullableStr,
  codTipoTramitacao: nullableStr,
  descricaoSituacao: nullableStr,
  codSituacao: z.union([z.number(), z.string()]).nullish().transform((v) => (v == null ? null : String(v))),
  despacho: nullableStr,
  url: nullableStr,
  ambito: nullableStr,
  apreciacao: nullableStr,
});

// Arquivos anuais (formato observado em proposicoes-2026.json etc.)
export const BulkProposicao = z.object({
  id: z.number(),
  siglaTipo: z.string(),
  numero: z.number(),
  ano: z.number(),
  descricaoTipo: nullableStr,
  ementa: z.string().nullish().transform((v) => v ?? ""),
  ementaDetalhada: nullableStr,
  keywords: nullableStr,
  dataApresentacao: nullableStr,
  urlInteiroTeor: nullableStr,
  uriPropPrincipal: nullableStr,
  ultimoStatus: z
    .object({
      data: nullableStr,
      uriRelator: nullableStr,
      siglaOrgao: nullableStr,
      regime: nullableStr,
      descricaoTramitacao: nullableStr,
      idTipoTramitacao: z.union([z.number(), z.string()]).nullish().transform((v) => (v == null ? null : String(v))),
      descricaoSituacao: nullableStr,
      idSituacao: z.union([z.number(), z.string()]).nullish().transform((v) => (v == null ? null : String(v))),
      despacho: nullableStr,
      apreciacao: nullableStr,
    })
    .nullish(),
});

export const BulkAutor = z.object({
  idProposicao: z.number(),
  idDeputadoAutor: z.number().nullish(),
  codTipoAutor: z.number().nullish(),
  tipoAutor: nullableStr,
  nomeAutor: z.string(),
  siglaPartidoAutor: nullableStr,
  siglaUFAutor: nullableStr,
  ordemAssinatura: numOrStr.nullish(),
  proponente: numOrStr.nullish(),
});

export const BulkTema = z.object({
  uriProposicao: z.string(),
  codTema: z.number(),
  tema: z.string(),
  relevancia: z.number().nullish(),
});

type Links = Array<{ rel: string; href: string }>;

export type RequestCounter = () => void;

export async function camaraGet<T extends z.ZodTypeAny>(
  path: string,
  params: Record<string, string | number | undefined>,
  schema: T,
  onRequest?: RequestCounter,
): Promise<z.infer<T>> {
  const url = new URL(CAMARA_API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  const body = await fetchJson<{ dados: unknown }>(url.toString(), { onRequest });
  return schema.parse(body.dados);
}

/** Pagina seguindo `links[rel=next]`, validando cada item. Itens inválidos são reportados, não descartados em silêncio. */
export async function* camaraPaginate<T extends z.ZodTypeAny>(
  path: string,
  params: Record<string, string | number | undefined>,
  itemSchema: T,
  opts: { onRequest?: RequestCounter; maxPages?: number; onInvalid?: (issue: string) => void } = {},
): AsyncGenerator<z.infer<T>[]> {
  const url = new URL(CAMARA_API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  let next: string | null = url.toString();
  let pages = 0;
  while (next && pages < (opts.maxPages ?? 200)) {
    const body: { dados: unknown[]; links?: Links } = await fetchJson(next, { onRequest: opts.onRequest });
    pages++;
    const items: z.infer<T>[] = [];
    for (const raw of body.dados ?? []) {
      const parsed = itemSchema.safeParse(raw);
      if (parsed.success) items.push(parsed.data);
      else opts.onInvalid?.(`${path}: item inválido (${parsed.error.issues[0]?.message})`);
    }
    yield items;
    const href: string | undefined = body.links?.find((l) => l.rel === "next")?.href;
    next = href ? assertAllowedUrl(href).toString() : null;
  }
}

/** Baixa um arquivo anual. Retorna null quando o servidor responde 304 (não mudou desde o checkpoint). */
export async function camaraBulkDownload(
  file: string,
  opts: { onRequest?: RequestCounter; ifModifiedSince?: string | null } = {},
): Promise<{ lastModified: string | null; data: unknown[] } | null> {
  let res: Response;
  try {
    res = await fetchWithRetry(`${CAMARA_FILES}/${file}`, {
      timeoutMs: 300_000,
      onRequest: opts.onRequest,
      retries: 2,
      headers: opts.ifModifiedSince ? { "if-modified-since": opts.ifModifiedSince } : undefined,
    });
  } catch (err) {
    if (err instanceof HttpError && err.status === 304) return null;
    throw err;
  }
  const lastModified = res.headers.get("last-modified");
  const bytes = await readLimited(res, 400 * 1024 * 1024);
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { dados?: unknown[] };
  return { lastModified, data: parsed.dados ?? [] };
}

export function camaraIdFromUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const m = uri.match(/\/(deputados|proposicoes)\/(\d+)$/);
  return m ? m[2] : null;
}

export function camaraDeputadoUrl(id: string) {
  return `https://www.camara.leg.br/deputados/${id}`;
}

export function camaraProposicaoUrl(id: string) {
  return `https://www.camara.leg.br/propostas-legislativas/${id}`;
}

export function camaraApiUrl(path: string) {
  return `${CAMARA_API}${path}`;
}
