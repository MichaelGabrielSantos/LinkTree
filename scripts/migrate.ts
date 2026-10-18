import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sqlClient } from "../src/server/db/client";
import { seedReferenceData } from "../src/server/db/seed";

await migrate(db, { migrationsFolder: "./drizzle" });
await seedReferenceData();
console.log("Migrações aplicadas e dados de referência (fontes e temas) atualizados.");
await sqlClient.end();
