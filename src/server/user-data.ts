import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db/client";
import { conversations, coverageInterest, follows, messages, persons, propositions, savedItems, topics, userPreferences, users } from "./db/schema";

/**
 * Todas as funções recebem o userId explicitamente e filtram por ele.
 * Nenhuma rota aceita userId vindo do cliente: ele sempre vem da sessão.
 */

export type FollowTarget = { targetType: "person" | "topic" | "proposition"; targetId: string };

async function targetExists(t: FollowTarget): Promise<boolean> {
  if (t.targetType === "topic") return !!(await db.query.topics.findFirst({ where: eq(topics.slug, t.targetId) }));
  if (!/^[0-9a-f-]{36}$/i.test(t.targetId)) return false;
  if (t.targetType === "person") return !!(await db.query.persons.findFirst({ where: eq(persons.id, t.targetId) }));
  return !!(await db.query.propositions.findFirst({ where: eq(propositions.id, t.targetId) }));
}

export async function follow(userId: string, t: FollowTarget, frequency: "diaria" | "semanal" = "diaria") {
  if (!(await targetExists(t))) throw new Error("Item inexistente");
  await db
    .insert(follows)
    .values({ userId, ...t, frequency })
    .onConflictDoUpdate({ target: [follows.userId, follows.targetType, follows.targetId], set: { frequency } });
}

export async function unfollow(userId: string, t: FollowTarget) {
  await db.delete(follows).where(and(eq(follows.userId, userId), eq(follows.targetType, t.targetType), eq(follows.targetId, t.targetId)));
}

export async function listFollows(userId: string) {
  return db.select().from(follows).where(eq(follows.userId, userId)).orderBy(desc(follows.createdAt));
}

export async function isFollowing(userId: string, t: FollowTarget) {
  const r = await db.query.follows.findFirst({
    where: and(eq(follows.userId, userId), eq(follows.targetType, t.targetType), eq(follows.targetId, t.targetId)),
  });
  return !!r;
}

export async function save(userId: string, itemType: "news" | "proposition", itemId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) throw new Error("Item inválido");
  await db.insert(savedItems).values({ userId, itemType, itemId }).onConflictDoNothing();
}

export async function unsave(userId: string, itemType: "news" | "proposition", itemId: string) {
  await db.delete(savedItems).where(and(eq(savedItems.userId, userId), eq(savedItems.itemType, itemType), eq(savedItems.itemId, itemId)));
}

export async function listSaved(userId: string) {
  return db.execute<{ item_type: string; item_id: string; created_at: string; title: string | null }>(sql`
    select s.item_type, s.item_id, s.created_at,
      case when s.item_type = 'news' then (select title from news_articles n where n.id::text = s.item_id)
           else (select sigla_tipo || ' ' || numero || '/' || ano || ' — ' || left(ementa, 140) from propositions p where p.id::text = s.item_id) end as title
    from saved_items s where s.user_id = ${userId} order by s.created_at desc`);
}

export async function savedIdSet(userId: string, itemType: "news" | "proposition", ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await db
    .select({ itemId: savedItems.itemId })
    .from(savedItems)
    .where(and(eq(savedItems.userId, userId), eq(savedItems.itemType, itemType), inArray(savedItems.itemId, ids)));
  return new Set(rows.map((r) => r.itemId));
}

export async function getPreferences(userId: string) {
  return (await db.query.userPreferences.findFirst({ where: eq(userPreferences.userId, userId) })) ?? { userId, categories: [] as string[] };
}

export async function setPreferences(userId: string, categories: string[]) {
  const valid = (await db.select({ slug: topics.slug }).from(topics)).map((t) => t.slug);
  const clean = categories.filter((c) => valid.includes(c));
  await db
    .insert(userPreferences)
    .values({ userId, categories: clean })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { categories: clean, updatedAt: sql`now()` } });
}

export async function appendConversation(userId: string, conversationId: string | null, context: { type: "news" | "proposition" | "person" | "geral"; id: string | null }, userText: string, assistantPayload: unknown) {
  let convId = conversationId;
  if (convId) {
    const owned = await db.query.conversations.findFirst({ where: and(eq(conversations.id, convId), eq(conversations.userId, userId)) });
    if (!owned) convId = null;
  }
  if (!convId) {
    const [c] = await db.insert(conversations).values({ userId, contextType: context.type, contextId: context.id }).returning({ id: conversations.id });
    convId = c.id;
  }
  await db.insert(messages).values([
    { conversationId: convId, role: "user", content: { text: userText } },
    { conversationId: convId, role: "assistant", content: assistantPayload },
  ]);
  return convId;
}

export async function listConversations(userId: string) {
  return db.execute<{ id: string; context_type: string; context_id: string | null; created_at: string; first_question: string | null; n: number }>(sql`
    select c.id, c.context_type, c.context_id, c.created_at,
      (select m.content->>'text' from messages m where m.conversation_id = c.id and m.role = 'user' order by m.id limit 1) as first_question,
      (select count(*)::int from messages m where m.conversation_id = c.id) as n
    from conversations c where c.user_id = ${userId} order by c.created_at desc limit 100`);
}

export async function deleteConversationHistory(userId: string) {
  await db.delete(conversations).where(eq(conversations.userId, userId));
}

export async function deleteAccount(userId: string) {
  await db.delete(users).where(eq(users.id, userId));
}

export async function registerCoverageInterest(userId: string | null, office: string, uf: string | null) {
  await db.insert(coverageInterest).values({ userId, office: office.slice(0, 60), uf: uf?.slice(0, 2) ?? null });
}
