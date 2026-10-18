import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "./db/client";
import { sessions, users } from "./db/schema";
import { sha256 } from "@/lib/hash";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = "ctx_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltHex, keyHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

export type CurrentUser = { id: string; email: string; role: "user" | "admin" };

function adminEmails(): Set<string> {
  return new Set((process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export async function createUser(email: string, password: string): Promise<CurrentUser> {
  const normalized = email.trim().toLowerCase();
  const role = adminEmails().has(normalized) ? "admin" : "user";
  const [u] = await db.insert(users).values({ email: normalized, passwordHash: await hashPassword(password), role }).returning();
  return { id: u.id, email: u.email, role: u.role };
}

export async function authenticate(email: string, password: string): Promise<CurrentUser | null> {
  const u = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email.trim().toLowerCase()}` });
  if (!u || !(await verifyPassword(password, u.passwordHash))) return null;
  return { id: u.id, email: u.email, role: u.role };
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export async function userFromToken(token: string | undefined | null): Promise<CurrentUser | null> {
  if (!token) return null;
  const rows = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") throw new Error("Acesso restrito à administração.");
  return u;
}
