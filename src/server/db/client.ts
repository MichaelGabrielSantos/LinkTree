import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __contextoSql?: postgres.Sql; __contextoDb?: Db };

/**
 * Conexão criada só no primeiro uso. Assim o `next build` (que importa as rotas para coletar
 * metadados) não exige DATABASE_URL; a falta da variável só aparece quando uma consulta é feita.
 */
function getDb(): Db {
  if (globalForDb.__contextoDb) return globalForDb.__contextoDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada (veja .env.example).");
  // prepare: false mantém compatibilidade com poolers em modo transação (Neon, Supabase, PgBouncer).
  const sql = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 5), prepare: false, onnotice: () => {} });
  globalForDb.__contextoSql = sql;
  globalForDb.__contextoDb = drizzle(sql, { schema });
  return globalForDb.__contextoDb;
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** Encerra a conexão (scripts e testes). */
export async function closeDb() {
  await globalForDb.__contextoSql?.end();
  globalForDb.__contextoSql = undefined;
  globalForDb.__contextoDb = undefined;
}

export { schema };
export type { Db };
