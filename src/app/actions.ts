"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { authenticate, createUser, endSession, getCurrentUser, startSession } from "@/server/auth";
import * as data from "@/server/user-data";
import { consumeRateLimit } from "@/server/ai/budget";

const safeNext = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "/";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
};

async function clientKey() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}

async function userOrLogin(next: string) {
  const u = await getCurrentUser();
  if (!u) redirect(`/perfil?entrar=1&next=${encodeURIComponent(next)}`);
  return u;
}

const Credentials = z.object({ email: z.string().email().max(200), password: z.string().min(10).max(200) });

export async function signupAction(_: unknown, form: FormData) {
  if (!(await consumeRateLimit(`auth:${await clientKey()}`, 20, 3600))) return { error: "Muitas tentativas. Tente mais tarde." };
  const parsed = Credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Informe um e-mail válido e uma senha com pelo menos 10 caracteres." };
  try {
    const u = await createUser(parsed.data.email, parsed.data.password);
    await startSession(u.id);
  } catch {
    return { error: "Não foi possível criar a conta. Se você já tem conta, entre com seu e-mail." };
  }
  redirect(safeNext(form.get("next")));
}

export async function loginAction(_: unknown, form: FormData) {
  if (!(await consumeRateLimit(`auth:${await clientKey()}`, 20, 3600))) return { error: "Muitas tentativas. Tente mais tarde." };
  const parsed = Credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "E-mail ou senha incorretos." };
  const u = await authenticate(parsed.data.email, parsed.data.password);
  if (!u) return { error: "E-mail ou senha incorretos." };
  await startSession(u.id);
  redirect(safeNext(form.get("next")));
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

const FollowInput = z.object({
  targetType: z.enum(["person", "topic", "proposition"]),
  targetId: z.string().min(1).max(64),
  intent: z.enum(["follow", "unfollow"]),
  frequency: z.enum(["diaria", "semanal"]).optional(),
});

export async function followAction(form: FormData) {
  const next = safeNext(form.get("next"));
  const u = await userOrLogin(next);
  const p = FollowInput.parse({
    targetType: form.get("targetType"),
    targetId: form.get("targetId"),
    intent: form.get("intent"),
    frequency: form.get("frequency") ?? undefined,
  });
  if (p.intent === "follow") await data.follow(u.id, p, p.frequency);
  else await data.unfollow(u.id, p);
  revalidatePath(next);
  revalidatePath("/acompanhando");
}

const SaveInput = z.object({ itemType: z.enum(["news", "proposition"]), itemId: z.string().uuid(), intent: z.enum(["save", "unsave"]) });

export async function saveAction(form: FormData) {
  const next = safeNext(form.get("next"));
  const u = await userOrLogin(next);
  const p = SaveInput.parse({ itemType: form.get("itemType"), itemId: form.get("itemId"), intent: form.get("intent") });
  if (p.intent === "save") await data.save(u.id, p.itemType, p.itemId);
  else await data.unsave(u.id, p.itemType, p.itemId);
  revalidatePath(next);
}

export async function preferencesAction(form: FormData) {
  const u = await userOrLogin("/perfil");
  await data.setPreferences(u.id, form.getAll("categories").map(String));
  revalidatePath("/perfil");
  revalidatePath("/");
  redirect("/perfil?salvo=1");
}

export async function deleteHistoryAction() {
  const u = await userOrLogin("/perfil");
  await data.deleteConversationHistory(u.id);
  revalidatePath("/perfil");
  redirect("/perfil?historico=apagado");
}

export async function deleteAccountAction(form: FormData) {
  const u = await userOrLogin("/perfil");
  if (form.get("confirm") !== "EXCLUIR") redirect("/perfil?erro=confirmacao");
  await endSession();
  await data.deleteAccount(u.id);
  redirect("/?conta=excluida");
}

export async function coverageInterestAction(form: FormData) {
  if (!(await consumeRateLimit(`interest:${await clientKey()}`, 30, 3600))) redirect("/cobertura?limite=1");
  const u = await getCurrentUser();
  const office = z.string().min(2).max(60).parse(form.get("office"));
  const uf = z.string().length(2).nullable().catch(null).parse(form.get("uf") || null);
  await data.registerCoverageInterest(u?.id ?? null, office, uf);
  redirect("/cobertura?registrado=1");
}
