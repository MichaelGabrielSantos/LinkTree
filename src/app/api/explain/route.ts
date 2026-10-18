import { NextResponse } from "next/server";
import { z } from "zod";
import { explainNews, explainProposition, type ExplainKind } from "@/server/ai/explain";
import { consumeRateLimit } from "@/server/ai/budget";
import { getCurrentUser } from "@/server/auth";
import { getNewsArticle } from "@/server/queries/news";
import { getProposition } from "@/server/queries/proposition";
import { ensurePropositionText } from "@/server/connectors/camara/texts";
import { withTimeout } from "@/lib/async";

const Body = z.object({
  subject: z.enum(["news", "proposition"]),
  id: z.string().uuid(),
  kind: z.union([z.enum(["explicacao", "simples", "exemplo", "argumentos"]), z.string().regex(/^termo:.{1,60}$/)]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  const user = await getCurrentUser();
  const client = user ? `u:${user.id}` : `ip:${(req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim()}`;
  if (!(await consumeRateLimit(`explain:${client}`, Number(process.env.AI_HOURLY_LIMIT_PER_CLIENT ?? 30) * 2, 3600))) {
    return NextResponse.json({ error: "Limite de explicações por hora atingido." }, { status: 429 });
  }
  const { subject, id } = parsed.data;
  const kind = parsed.data.kind as ExplainKind;
  if (subject === "news") {
    const view = await getNewsArticle(id);
    if (!view) return NextResponse.json({ error: "Notícia não encontrada" }, { status: 404 });
    return NextResponse.json(await explainNews(view, kind));
  }
  let view = await getProposition(id);
  if (!view) return NextResponse.json({ error: "Proposição não encontrada" }, { status: 404 });
  // Tenta obter o inteiro teor antes de explicar; se falhar, a explicação avisa que só há ementa.
  try {
    await withTimeout(ensurePropositionText(id), 25_000);
    view = (await getProposition(id))!;
  } catch {
    /* segue com o que houver */
  }
  return NextResponse.json(await explainProposition(view, kind));
}
