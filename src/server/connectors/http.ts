/**
 * HTTP para conectores: só hosts permitidos, timeout, retentativas limitadas com backoff
 * exponencial + jitter, respeito a Retry-After. Nunca segue redirecionamento para host fora da lista.
 */

export const ALLOWED_HOSTS = new Set([
  "dadosabertos.camara.leg.br",
  "www.camara.leg.br",
  "camara.leg.br",
  "agenciabrasil.ebc.com.br",
  "legis.senado.leg.br",
  "cdn.tse.jus.br",
]);

export const USER_AGENT = "ImparcialiBot/0.1 (+https://github.com/michaelgabrielsantos/linktree; ingestao de dados abertos)";

export class HttpError extends Error {
  constructor(message: string, readonly status: number | null, readonly url: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(`URL inválida: ${raw}`, null, raw);
  }
  if (url.protocol !== "https:") throw new HttpError(`Protocolo não permitido: ${url.protocol}`, null, raw);
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new HttpError(`Host não permitido: ${url.hostname}`, null, raw);
  return url;
}

export type FetchOptions = {
  accept?: string;
  timeoutMs?: number;
  retries?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  /** Contador de requisições para registrar na execução de ingestão. */
  onRequest?: () => void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, 60_000);
  }
  const base = 1000 * 2 ** attempt;
  return Math.min(base + Math.random() * 500, 30_000);
}

async function fetchOnce(url: URL, opts: FetchOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    opts.onRequest?.();
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        headers: { "user-agent": USER_AGENT, accept: opts.accept ?? "application/json", ...opts.headers },
        redirect: "manual",
        signal: controller.signal,
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = assertAllowedUrl(new URL(res.headers.get("location")!, current).toString());
        continue;
      }
      return res;
    }
    throw new HttpError("Redirecionamentos demais", null, url.toString());
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWithRetry(raw: string, opts: FetchOptions = {}): Promise<Response> {
  const url = assertAllowedUrl(raw);
  const retries = opts.retries ?? Number(process.env.CONNECTOR_RETRIES ?? 3);
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetchOnce(url, opts);
    } catch (err) {
      // HttpError aqui = URL/redirecionamento recusado: não é retentável.
      if (err instanceof HttpError) throw err;
      lastError = err;
      if (attempt === retries) break;
      await sleep(backoffMs(attempt, null));
      continue;
    }
    if (res.ok) return res;
    lastError = new HttpError(`HTTP ${res.status} em ${url.pathname}`, res.status, url.toString());
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === retries) throw lastError;
    await sleep(backoffMs(attempt, res.headers.get("retry-after")));
  }
  const message = lastError instanceof Error ? lastError.message : "desconhecida";
  throw new HttpError(`Falha de rede após ${retries + 1} tentativas: ${message}`, null, url.toString());
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchWithRetry(url, { ...opts, accept: "application/json" });
  return (await res.json()) as T;
}

/** Lê o corpo com limite de tamanho (protege contra respostas gigantes). */
export async function readLimited(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared && declared > maxBytes) throw new HttpError(`Resposta excede ${maxBytes} bytes`, res.status, res.url);
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(`Resposta excede ${maxBytes} bytes`, res.status, res.url);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
