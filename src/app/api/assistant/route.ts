import { NextResponse } from "next/server";
import { z } from "zod";
import { askAssistant } from "@/server/ai/assistant";
import { consumeRateLimit } from "@/server/ai/budget";
import { getCurrentUser } from "@/server/auth";
import { appendConversation } from "@/server/user-data";

// Chamada ao modelo pode levar dezenas de segundos; 60 s é o máximo do plano Hobby.
export const maxDuration = 60;

const Body = z.object({
  question: z.string().min(1).max(1000),
  context: z.object({ type: z.enum(["news", "proposition", "person"]), id: z.string().uuid() }).nullable(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(20).default([]),
  conversationId: z.string().uuid().nullable().optional(),
  personId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  const user = await getCurrentUser();
  const client = user ? `u:${user.id}` : `ip:${(req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim()}`;
  const hourly = Number(process.env.AI_HOURLY_LIMIT_PER_CLIENT ?? 30);
  if (!(await consumeRateLimit(`assistant:${client}`, hourly, 3600))) {
    return NextResponse.json({ error: "Limite de perguntas por hora atingido. Tente mais tarde." }, { status: 429 });
  }
  const { question, context, history, conversationId, personId } = parsed.data;
  const response = await askAssistant(question, context, history, { personId });
  // Histórico só existe para quem tem conta, é privado e pode ser apagado no perfil.
  let convId: string | null = null;
  if (user) {
    convId = await appendConversation(user.id, conversationId ?? null, { type: context?.type ?? "geral", id: context?.id ?? null }, question, response);
  }
  return NextResponse.json({ response, conversationId: convId });
}
