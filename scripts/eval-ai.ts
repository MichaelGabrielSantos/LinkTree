/**
 * Avaliação do assistente contra casos com evidências conhecidas (evals/cases.ts).
 * Uso: AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... npm run eval:ai
 * Cada execução chama o modelo uma vez por caso (custo real). Sem provedor, não mede nada.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { EVAL_CASES, gradeCase, type CaseResult } from "../evals/cases";
import { finalizeEvidence } from "../src/server/ai/evidence";
import { generateGroundedAnswer } from "../src/server/ai/assistant";
import { getProvider } from "../src/server/ai/provider";
import { sqlClient } from "../src/server/db/client";

const provider = getProvider();
if (!provider.configured) {
  console.log("Provedor de IA não configurado (AI_PROVIDER/ANTHROPIC_API_KEY). Nenhuma métrica foi medida.");
  await sqlClient.end();
  process.exit(0);
}
const results: CaseResult[] = [];
for (const c of EVAL_CASES) {
  const evidence = finalizeEvidence(c.docs);
  const gen = await generateGroundedAnswer(c.question, evidence);
  if (!gen.ok) {
    results.push({ id: c.id, category: c.category, ok: false, failures: [`geração falhou: ${gen.reason}`], unknownRefs: 0, removedClaims: 0, keptClaims: 0, abstained: true });
    continue;
  }
  const r = gradeCase(c, gen.answer, gen.report);
  results.push(r);
  console.log(`${r.ok ? "✓" : "✗"} ${c.id} (${c.category})${r.failures.length ? ` — ${r.failures.join("; ")}` : ""}`);
}
const totalKept = results.reduce((a, r) => a + r.keptClaims, 0);
const totalRemoved = results.reduce((a, r) => a + r.removedClaims, 0);
const summary = {
  model: provider.model,
  at: new Date().toISOString(),
  casesPassed: `${results.filter((r) => r.ok).length}/${results.length}`,
  claimsKept: totalKept,
  claimsRemovedByValidator: totalRemoved,
  unknownCitations: results.reduce((a, r) => a + r.unknownRefs, 0),
  abstentionCasesCorrect: `${results.filter((r) => EVAL_CASES.find((c) => c.id === r.id)!.expect.abstain && r.abstained).length}/${EVAL_CASES.filter((c) => c.expect.abstain).length}`,
  results,
};
console.log(JSON.stringify({ ...summary, results: undefined }, null, 2));
mkdirSync("evals/results", { recursive: true });
writeFileSync(`evals/results/${summary.at.replace(/[:.]/g, "-")}.json`, JSON.stringify(summary, null, 2));
await sqlClient.end();
