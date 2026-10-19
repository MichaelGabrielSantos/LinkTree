import { closeDb } from "../src/server/db/client";
import { isJobName, JOBS } from "../src/server/ingestion/jobs";

const [job, ...args] = process.argv.slice(2);
if (!job || !isJobName(job)) {
  console.error(`Uso: npm run ingest -- <${Object.keys(JOBS).join("|")}> [args]`);
  process.exit(1);
}
const started = Date.now();
try {
  const results = await JOBS[job](args);
  for (const r of results) console.log(JSON.stringify(r, (_k, v) => (v instanceof Map ? undefined : v)));
  // Execução registrada como falha também falha o processo (visível em CI/Actions).
  const failed = results.filter((r) => typeof r === "object" && r !== null && "status" in r && r.status === "failed");
  if (failed.length) {
    console.error(`${failed.length} execução(ões) falharam; veja ingestion_runs ou o painel /admin.`);
    process.exitCode = 1;
  }
  console.log(`ok (${((Date.now() - started) / 1000).toFixed(1)}s)`);
} catch (err) {
  console.error("Falha:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
