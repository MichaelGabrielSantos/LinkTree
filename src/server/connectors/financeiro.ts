import { unzipSync } from "fflate";
import { parse } from "csv-parse/sync";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { ceapMonthly, ceapSuppliers, declaredAssets, personExternalIds } from "../db/schema";
import { fetchWithRetry, HttpError, readLimited } from "./http";
import { getCheckpoint, setCheckpoint, withRun, type RunContext } from "../ingestion/runs";
import { upsertPersonByCamaraId } from "./camara/jobs";
import { parseMoney } from "@/domain/ceap";
import { sha256 } from "@/lib/hash";

type Row = Record<string, string>;

async function downloadZip(url: string, ctx: RunContext, ifModifiedSince?: string | null): Promise<{ files: Record<string, Uint8Array>; lastModified: string | null } | null> {
  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      accept: "application/zip, application/octet-stream",
      timeoutMs: 300_000,
      retries: 2,
      onRequest: ctx.countRequest,
      headers: ifModifiedSince ? { "if-modified-since": ifModifiedSince } : undefined,
    });
  } catch (err) {
    if (err instanceof HttpError && err.status === 304) return null;
    throw err;
  }
  const bytes = await readLimited(res, 300 * 1024 * 1024);
  return { files: unzipSync(bytes), lastModified: res.headers.get("last-modified") };
}

function parseCsv(bytes: Uint8Array, encoding: "utf-8" | "latin1"): Row[] {
  const text = new TextDecoder(encoding).decode(bytes).replace(/^﻿/, "");
  return parse(text, { delimiter: ";", columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true }) as Row[];
}

async function personIdsByCamara(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const rows = await db
      .select({ externalId: personExternalIds.externalId, personId: personExternalIds.personId })
      .from(personExternalIds)
      .where(and(eq(personExternalIds.system, "camara"), inArray(personExternalIds.externalId, ids.slice(i, i + 1000))));
    for (const r of rows) out.set(r.externalId, r.personId);
  }
  return out;
}

const ceapUrl = (year: number) => `https://www.camara.leg.br/cotas/Ano-${year}.csv.zip`;

/**
 * CEAP de um ano: agrega por deputado × mês × categoria e por fornecedor.
 * Substitui os agregados do ano numa transação (reexecução é idempotente; falha não apaga o que existia).
 * Linhas sem ideCadastro (lideranças partidárias) não são atribuídas a pessoas.
 */
export async function syncCeap(year: number, opts: { force?: boolean } = {}) {
  return withRun("camara", "camara:ceap", { year }, async (ctx) => {
    const ckKey = `camara:ceap:${year}`;
    const ck = await getCheckpoint<{ lastModified?: string }>(ckKey);
    const zip = await downloadZip(ceapUrl(year), ctx, opts.force ? null : ck?.lastModified);
    if (!zip) return { skipped: true };
    const name = Object.keys(zip.files).find((n) => n.endsWith(".csv"));
    if (!name) throw new Error("Arquivo CSV não encontrado no ZIP da CEAP");
    const rows = parseCsv(zip.files[name], "utf-8");

    const ids = [...new Set(rows.map((r) => r.ideCadastro).filter((x) => /^\d+$/.test(x ?? "")))];
    const personBy = await personIdsByCamara(ids);
    for (const id of ids) {
      if (personBy.has(id)) continue;
      const nome = rows.find((r) => r.ideCadastro === id)?.txNomeParlamentar ?? `Deputado(a) ${id}`;
      personBy.set(id, (await upsertPersonByCamaraId(id, { name: nome }, { overwriteName: false })).personId);
    }

    const monthly = new Map<string, typeof ceapMonthly.$inferInsert>();
    const suppliers = new Map<string, typeof ceapSuppliers.$inferInsert>();
    let unattributed = 0;
    for (const r of rows) {
      ctx.seen++;
      const personId = personBy.get(r.ideCadastro);
      if (!personId) {
        unattributed++;
        continue;
      }
      const month = Number(r.numMes);
      const category = (r.txtDescricao ?? "").trim() || "NÃO INFORMADA";
      const value = parseMoney(r.vlrLiquido);
      const mk = `${personId}|${month}|${category}`;
      const m = monthly.get(mk) ?? { personId, year, month, category, netValue: 0, documents: 0 };
      m.netValue += value;
      m.documents += 1;
      monthly.set(mk, m);

      const doc = (r.txtCNPJCPF ?? "").replace(/\D/g, "");
      const isCompany = doc.length === 14;
      const isPerson = doc.length === 11;
      // Pessoa física: nem CPF nem nome são guardados (minimização).
      const supplierName = isPerson ? "Pessoa física (identificação omitida)" : (r.txtFornecedor ?? "").trim() || "Não informado";
      const supplierKey = isCompany ? `cnpj:${doc}` : isPerson ? `pf:${sha256(doc).slice(0, 16)}` : `nome:${supplierName.toLowerCase()}`;
      const sk = `${personId}|${supplierKey}|${category}`;
      const s = suppliers.get(sk) ?? { personId, year, supplierKey, supplierName, cnpj: isCompany ? doc : null, category, netValue: 0, documents: 0 };
      s.netValue += value;
      s.documents += 1;
      suppliers.set(sk, s);
    }

    await db.transaction(async (tx) => {
      await tx.delete(ceapMonthly).where(eq(ceapMonthly.year, year));
      await tx.delete(ceapSuppliers).where(eq(ceapSuppliers.year, year));
      const ms = [...monthly.values()].map((m) => ({ ...m, netValue: Math.round(m.netValue * 100) / 100 }));
      for (let i = 0; i < ms.length; i += 2000) await tx.insert(ceapMonthly).values(ms.slice(i, i + 2000));
      const ss = [...suppliers.values()].map((s) => ({ ...s, netValue: Math.round(s.netValue * 100) / 100 }));
      for (let i = 0; i < ss.length; i += 2000) await tx.insert(ceapSuppliers).values(ss.slice(i, i + 2000));
    });
    ctx.created += monthly.size;
    if (zip.lastModified) await setCheckpoint(ckKey, { lastModified: zip.lastModified });
    // Lançamentos de lideranças (sem ideCadastro) não pertencem a uma pessoa: informados, não atribuídos.
    return { rows: rows.length, deputies: ids.length, unattributed };
  });
}

/**
 * Patrimônio declarado ao TSE (bens de candidatos) para deputados federais.
 * Vínculo Câmara↔TSE pelo CPF, que aparece nos arquivos oficiais da Câmara (CEAP) e do TSE.
 * O CPF só existe em memória durante a carga; o banco guarda apenas o ID do candidato no TSE.
 */
export async function syncDeclaredAssets(electionYear: number, cpfSourceYears: number[]) {
  return withRun("tse", "tse:bens", { electionYear, cpfSourceYears }, async (ctx) => {
    // 1. CPF → ideCadastro (Câmara), a partir dos arquivos da CEAP.
    const cpfToCamara = new Map<string, string>();
    for (const y of cpfSourceYears) {
      const zip = await downloadZip(ceapUrl(y), ctx);
      const name = zip && Object.keys(zip.files).find((n) => n.endsWith(".csv"));
      if (!zip || !name) continue;
      for (const r of parseCsv(zip.files[name], "utf-8")) {
        const cpf = (r.cpf ?? "").replace(/\D/g, "");
        if (cpf.length === 11 && /^\d+$/.test(r.ideCadastro ?? "")) cpfToCamara.set(cpf, r.ideCadastro);
      }
    }

    // 2. Candidaturas a deputado federal (CD_CARGO = 6) → SQ_CANDIDATO por CPF.
    const candZip = await downloadZip(`https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${electionYear}.zip`, ctx);
    if (!candZip) throw new Error("Arquivo de candidaturas indisponível");
    const sqToCamara = new Map<string, string>();
    const candFiles = Object.keys(candZip.files).filter((n) => n.endsWith(".csv") && !n.includes("BRASIL"));
    for (const n of candFiles) {
      for (const r of parseCsv(candZip.files[n], "latin1")) {
        if (r.CD_CARGO !== "6" || r.CD_TIPO_ELEICAO !== "2") continue;
        const camara = cpfToCamara.get((r.NR_CPF_CANDIDATO ?? "").replace(/\D/g, ""));
        if (camara) sqToCamara.set(r.SQ_CANDIDATO, camara);
      }
    }
    cpfToCamara.clear();
    const personBy = await personIdsByCamara([...new Set(sqToCamara.values())]);

    // 3. Bens dos candidatos vinculados.
    const bensZip = await downloadZip(`https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_${electionYear}.zip`, ctx);
    if (!bensZip) throw new Error("Arquivo de bens indisponível");
    const assets: Array<typeof declaredAssets.$inferInsert> = [];
    for (const n of Object.keys(bensZip.files).filter((x) => x.endsWith(".csv") && !x.includes("BRASIL"))) {
      for (const r of parseCsv(bensZip.files[n], "latin1")) {
        ctx.seen++;
        const camara = sqToCamara.get(r.SQ_CANDIDATO);
        const personId = camara ? personBy.get(camara) : undefined;
        if (!personId) continue;
        assets.push({
          personId,
          electionYear,
          candidateId: r.SQ_CANDIDATO,
          order: Number(r.NR_ORDEM_BEM_CANDIDATO) || assets.length + 1,
          assetType: (r.DS_TIPO_BEM_CANDIDATO ?? "").trim() || "NÃO INFORMADO",
          description: (r.DS_BEM_CANDIDATO ?? "").trim() || null,
          value: parseMoney(r.VR_BEM_CANDIDATO),
        });
      }
    }
    const unique = [...new Map(assets.map((a) => [`${a.personId}|${a.order}`, a])).values()];
    await db.transaction(async (tx) => {
      await tx.delete(declaredAssets).where(eq(declaredAssets.electionYear, electionYear));
      for (let i = 0; i < unique.length; i += 2000) await tx.insert(declaredAssets).values(unique.slice(i, i + 2000));
      for (const [sq, camara] of sqToCamara) {
        const personId = personBy.get(camara);
        if (!personId) continue;
        await tx
          .insert(personExternalIds)
          .values({ personId, system: "tse", externalId: `${electionYear}:${sq}`, method: "cpf_oficial" })
          .onConflictDoNothing();
      }
    });
    ctx.created += unique.length;
    return { matchedCandidates: sqToCamara.size, assets: unique.length };
  });
}

/** Quantos deputados da legislatura atual têm patrimônio vinculado (para exibir cobertura). */
export async function assetsCoverage(electionYear: number) {
  const rows = await db.execute<{ with_assets: number; total: number }>(sql`
    select (select count(distinct person_id)::int from declared_assets where election_year = ${electionYear}) as with_assets,
           (select count(distinct person_id)::int from mandates where legislature = 57) as total`);
  return rows[0];
}
