import { and, desc, eq, sql } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import { db } from "../../db/client";
import { propositions, propositionTexts } from "../../db/schema";
import { sha256 } from "@/lib/hash";
import { fetchWithRetry, HttpError, readLimited } from "../http";

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 400_000;

export type PropositionText = typeof propositionTexts.$inferSelect;

/**
 * Extrai o texto do inteiro teor oficial (PDF). Se o hash mudar, uma nova linha é gravada,
 * o que invalida explicações cacheadas ligadas ao hash anterior.
 */
export async function ensurePropositionText(propositionId: string, opts: { maxAgeHours?: number } = {}): Promise<PropositionText | null> {
  const prop = await db.query.propositions.findFirst({ where: eq(propositions.id, propositionId) });
  if (!prop?.urlInteiroTeor) return null;
  const latest = await db.query.propositionTexts.findFirst({
    where: and(eq(propositionTexts.propositionId, propositionId), eq(propositionTexts.url, prop.urlInteiroTeor)),
    orderBy: desc(propositionTexts.extractedAt),
  });
  const maxAge = (opts.maxAgeHours ?? 24 * 7) * 3600_000;
  if (latest && latest.status === "ok" && Date.now() - latest.extractedAt.getTime() < maxAge) return latest;
  // Depois de uma falha, espera 6 h antes de tentar de novo (não insistir em servidor que recusou).
  if (latest && latest.status !== "ok" && Date.now() - latest.extractedAt.getTime() < 6 * 3600_000) return latest;

  let row: typeof propositionTexts.$inferInsert;
  try {
    const res = await fetchWithRetry(prop.urlInteiroTeor, { accept: "application/pdf", timeoutMs: 60_000, retries: 2 });
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("pdf")) {
      row = { propositionId, url: prop.urlInteiroTeor, status: "sem_texto", error: `Tipo inesperado: ${type}` };
    } else {
      const bytes = await readLimited(res, MAX_PDF_BYTES);
      const pdf = await getDocumentProxy(bytes);
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      const clean = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      if (!clean) {
        row = { propositionId, url: prop.urlInteiroTeor, status: "sem_texto", pageCount: totalPages, error: "PDF sem camada de texto (possivelmente digitalizado)." };
      } else if (clean.length > MAX_TEXT_CHARS) {
        row = { propositionId, url: prop.urlInteiroTeor, status: "muito_grande", pageCount: totalPages, contentHash: sha256(clean), text: clean.slice(0, MAX_TEXT_CHARS) };
      } else {
        row = { propositionId, url: prop.urlInteiroTeor, status: "ok", pageCount: totalPages, contentHash: sha256(clean), text: clean };
      }
    }
  } catch (err) {
    // Falha não apaga o texto válido anterior.
    if (latest?.status === "ok") return latest;
    const blocked = err instanceof HttpError && err.status === 429;
    row = {
      propositionId,
      url: prop.urlInteiroTeor,
      status: "falha",
      error: blocked
        ? "O site da Câmara recusou o acesso automatizado ao PDF (HTTP 429). Não contornamos esse bloqueio."
        : err instanceof Error ? err.message : String(err),
    };
  }
  const [saved] = await db
    .insert(propositionTexts)
    .values(row)
    .onConflictDoUpdate({
      target: [propositionTexts.propositionId, propositionTexts.url],
      set: { ...row, extractedAt: sql`now()` },
    })
    .returning();
  return saved;
}
