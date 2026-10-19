import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { assetGroup, ceapCategoryLabel } from "@/domain/ceap";

export type CeapSummary = {
  years: number[];
  year: number;
  total: number;
  documents: number;
  months: Array<{ month: number; value: number }>;
  categories: Array<{ label: string; raw: string; value: number; documents: number }>;
  suppliers: Array<{ name: string; cnpj: string | null; category: string; value: number; documents: number }>;
  lastMonth: number | null;
};

export async function ceapSummary(personId: string, year?: number): Promise<CeapSummary | null> {
  const yearsRows = await db.execute<{ year: number }>(sql`select distinct year from ceap_monthly where person_id = ${personId} order by year desc`);
  const years = yearsRows.map((r) => Number(r.year));
  if (!years.length) return null;
  const y = year && years.includes(year) ? year : years[0];
  const [months, cats, sups] = await Promise.all([
    db.execute<{ month: number; v: number }>(sql`
      select month, sum(net_value)::float as v from ceap_monthly where person_id = ${personId} and year = ${y} group by month order by month`),
    db.execute<{ category: string; v: number; d: number }>(sql`
      select category, sum(net_value)::float as v, sum(documents)::int as d from ceap_monthly
      where person_id = ${personId} and year = ${y} group by category order by v desc`),
    db.execute<{ supplier_name: string; cnpj: string | null; category: string; v: number; d: number }>(sql`
      select supplier_name, cnpj, category, net_value::float as v, documents as d from ceap_suppliers
      where person_id = ${personId} and year = ${y} order by net_value desc limit 10`),
  ]);
  const monthMap = new Map(months.map((m) => [Number(m.month), Number(m.v)]));
  const lastMonth = months.length ? Math.max(...months.map((m) => Number(m.month))) : null;
  return {
    years,
    year: y,
    total: cats.reduce((a, c) => a + Number(c.v), 0),
    documents: cats.reduce((a, c) => a + Number(c.d), 0),
    months: Array.from({ length: lastMonth ?? 0 }, (_, i) => ({ month: i + 1, value: monthMap.get(i + 1) ?? 0 })),
    categories: cats.map((c) => ({ label: ceapCategoryLabel(c.category), raw: c.category, value: Number(c.v), documents: Number(c.d) })),
    suppliers: sups.map((s) => ({ name: s.supplier_name, cnpj: s.cnpj, category: ceapCategoryLabel(s.category), value: Number(s.v), documents: Number(s.d) })),
    lastMonth,
  };
}

export async function ceapYearTotal(personId: string): Promise<{ year: number; total: number } | null> {
  const rows = await db.execute<{ year: number; v: number }>(sql`
    select year, sum(net_value)::float as v from ceap_monthly where person_id = ${personId} group by year order by year desc limit 1`);
  return rows[0] ? { year: Number(rows[0].year), total: Number(rows[0].v) } : null;
}

export type AssetsSummary = {
  electionYear: number;
  total: number;
  count: number;
  groups: Array<{ group: string; value: number; count: number }>;
  items: Array<{ type: string; description: string | null; value: number }>;
};

export async function declaredAssetsSummary(personId: string): Promise<AssetsSummary | null> {
  const rows = await db.execute<{ election_year: number; asset_type: string; description: string | null; value: number }>(sql`
    select election_year, asset_type, description, value::float as value from declared_assets
    where person_id = ${personId} and election_year = (select max(election_year) from declared_assets where person_id = ${personId})
    order by value desc`);
  if (!rows.length) return null;
  const groups = new Map<string, { value: number; count: number }>();
  for (const r of rows) {
    const g = assetGroup(r.asset_type);
    const cur = groups.get(g) ?? { value: 0, count: 0 };
    cur.value += Number(r.value);
    cur.count += 1;
    groups.set(g, cur);
  }
  return {
    electionYear: Number(rows[0].election_year),
    total: rows.reduce((a, r) => a + Number(r.value), 0),
    count: rows.length,
    groups: [...groups.entries()].map(([group, v]) => ({ group, ...v })).sort((a, b) => b.value - a.value),
    items: rows.map((r) => ({ type: r.asset_type, description: r.description, value: Number(r.value) })),
  };
}
