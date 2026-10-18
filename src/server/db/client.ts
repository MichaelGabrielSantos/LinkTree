import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __contextoSql?: postgres.Sql };

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada (veja .env.example).");
  return url;
}

export const sqlClient =
  globalForDb.__contextoSql ?? postgres(connectionString(), { max: 10, onnotice: () => {} });
if (process.env.NODE_ENV !== "production") globalForDb.__contextoSql = sqlClient;

export const db = drizzle(sqlClient, { schema });
export type Db = typeof db;
export { schema };
