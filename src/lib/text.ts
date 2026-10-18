import sanitizeHtml from "sanitize-html";

/** Remove todo HTML (inclusive imagens/pixels de rastreamento) e normaliza espaços. */
export function htmlToPlainText(html: string): string {
  const withBreaks = html.replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  const text = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return decodeEntities(text)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Corta em fim de frase sem ultrapassar `max` caracteres. */
export function truncateAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (lastStop > max * 0.5) return slice.slice(0, lastStop + 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : max)}…`;
}

export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  "a o as os de da do das dos e em no na nos nas um uma uns umas para por com sem sobre que se ao aos à às pelo pela pelos pelas é ser foi são mais menos diz após contra entre até como seu sua seus suas ou já não".split(" "),
);

export function contentTokens(s: string): string[] {
  return normalizeForMatch(s)
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}
