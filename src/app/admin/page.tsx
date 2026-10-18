import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { adminAuditLog } from "@/server/db/schema";
import { getCurrentUser, requireAdmin } from "@/server/auth";
import { JOBS } from "@/server/ingestion/jobs";
import { getProvider } from "@/server/ai/provider";
import { Badge, Card, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Administração" };
export const dynamic = "force-dynamic";

/** Frequência esperada por job, para sinalizar atraso. */
const EXPECTED_H: Record<string, number> = {
  "agencia-brasil:rss": 1,
  "camara:deputados": 26,
  "camara:proposicoes-anual": 26,
};

async function runNewsNow() {
  "use server";
  const admin = await requireAdmin();
  await db.insert(adminAuditLog).values({ userId: admin.id, action: "ingest:noticias:manual", details: {} });
  await JOBS.noticias();
  revalidatePath("/admin");
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/perfil?entrar=1&next=/admin");
  if (user.role !== "admin") {
    return <Notice tone="error" title="Acesso restrito">Esta área é exclusiva da administração.</Notice>;
  }
  const [jobs, failures, usage, answers, counts, interest, audit] = await Promise.all([
    db.execute<{ job: string; source_id: string; last_start: string; last_status: string; last_success: string | null; runs_7d: number; failures_7d: number; avg_s: number | null }>(sql`
      select job, max(source_id) as source_id, max(started_at) as last_start,
        (array_agg(status order by started_at desc))[1] as last_status,
        max(finished_at) filter (where status in ('success','partial')) as last_success,
        count(*) filter (where started_at > now() - interval '7 days')::int as runs_7d,
        count(*) filter (where status = 'failed' and started_at > now() - interval '7 days')::int as failures_7d,
        avg(extract(epoch from finished_at - started_at)) filter (where finished_at is not null) as avg_s
      from ingestion_runs group by job order by job`),
    db.execute<{ id: number; job: string; status: string; started_at: string; error: string | null }>(sql`
      select id, job, status, started_at, error from ingestion_runs where status in ('failed','partial') order by started_at desc limit 15`),
    db.execute<{ period: string; calls: number; cost: number | null; inp: number | null; out: number | null }>(sql`
      select '24h' as period, count(*)::int as calls, sum(estimated_cost_usd) as cost, sum(input_tokens)::int as inp, sum(output_tokens)::int as out from ai_usage where at > now() - interval '24 hours'
      union all
      select '30d', count(*)::int, sum(estimated_cost_usd), sum(input_tokens)::int, sum(output_tokens)::int from ai_usage where at > now() - interval '30 days'`),
    db.execute<{ status: string; n: number; removed: number | null }>(sql`
      select status, count(*)::int as n, sum(jsonb_array_length(validation->'removed'))::int as removed from generated_answers group by status`),
    db.execute<{ persons: number; props: number; authors: number; news: number; users: number }>(sql`
      select (select count(*)::int from persons) as persons, (select count(*)::int from propositions) as props,
        (select count(*)::int from proposition_authors) as authors, (select count(*)::int from news_articles) as news, (select count(*)::int from users) as users`),
    db.execute<{ office: string; n: number }>(sql`select office, count(*)::int as n from coverage_interest group by office order by n desc`),
    db.execute<{ at: string; action: string; email: string | null }>(sql`select a.at, a.action, u.email from admin_audit_log a left join users u on u.id = a.user_id order by a.at desc limit 10`),
  ]);
  const provider = getProvider();
  const c = counts[0];
  return (
    <>
      <PageHeader title="Administração">Saúde dos conectores, custos de IA e auditoria. Não existe controle para favorecer pessoas ou partidos na ordenação.</PageHeader>
      <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-5">
        {[["Pessoas", c.persons], ["Proposições", c.props], ["Vínculos de autoria", c.authors], ["Notícias", c.news], ["Contas", c.users]].map(([k, v]) => (
          <div key={k as string} className="rounded-lg bg-surface-2 p-3"><p className="text-xl font-semibold">{Number(v).toLocaleString("pt-BR")}</p><p className="text-xs text-ink-3">{k}</p></div>
        ))}
      </div>

      <SectionTitle>Conectores</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-ink-3"><th className="py-1">Job</th><th>Último status</th><th>Último sucesso</th><th>Atraso</th><th>Execuções 7d</th><th>Falhas 7d</th><th>Duração média</th></tr></thead>
          <tbody>
            {jobs.map((j) => {
              const lastOk = j.last_success ? new Date(j.last_success) : null;
              const late = EXPECTED_H[j.job] && (!lastOk || Date.now() - lastOk.getTime() > EXPECTED_H[j.job] * 3600_000);
              return (
                <tr key={j.job} className="border-t border-line">
                  <td className="py-1.5 font-mono text-xs">{j.job}</td>
                  <td><Badge tone={j.last_status === "success" ? "ok" : "warn"}>{j.last_status}</Badge></td>
                  <td>{formatDateTime(lastOk)}</td>
                  <td>{late ? <Badge tone="warn">atrasado</Badge> : "—"}</td>
                  <td>{j.runs_7d}</td>
                  <td>{j.failures_7d}</td>
                  <td>{j.avg_s ? `${Number(j.avg_s).toFixed(1)} s` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form action={runNewsNow} className="mt-3"><button className="rounded-lg border border-line px-3 py-1.5 text-sm">Coletar notícias agora (registrado na auditoria)</button></form>

      <SectionTitle>Falhas e execuções parciais recentes</SectionTitle>
      {failures.length === 0 ? <p className="text-sm text-ink-2">Nenhuma.</p> : (
        <ul className="space-y-2 text-sm">{failures.map((f) => <li key={f.id}><Card><p className="text-xs text-ink-3">#{f.id} · {f.job} · {formatDateTime(f.started_at)} · {f.status}</p><pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-xs">{f.error?.slice(0, 1500)}</pre></Card></li>)}</ul>
      )}

      <SectionTitle>IA</SectionTitle>
      <Card>
        <p className="text-sm">Provedor: <strong>{provider.name}</strong> · modelo: {provider.model} · limite diário: {process.env.AI_DAILY_CALL_LIMIT ?? 500} chamadas</p>
        <ul className="mt-2 text-sm">{usage.map((u) => <li key={u.period}>{u.period}: {u.calls} chamadas · {(u.inp ?? 0).toLocaleString("pt-BR")} tokens de entrada · {(u.out ?? 0).toLocaleString("pt-BR")} de saída · custo estimado US$ {(u.cost ?? 0).toFixed(2)}</li>)}</ul>
        <p className="mt-2 text-sm">Explicações em cache: {answers.map((a) => `${a.status}: ${a.n} (${a.removed ?? 0} itens removidos pela validação)`).join(" · ") || "nenhuma"}</p>
      </Card>

      <SectionTitle>Interesse por cargos sem cobertura</SectionTitle>
      <ul className="text-sm">{interest.map((i) => <li key={i.office}>{i.office}: {i.n}</li>)}{interest.length === 0 && <li className="text-ink-3">Nenhum registro.</li>}</ul>

      <SectionTitle>Auditoria administrativa</SectionTitle>
      <ul className="text-sm">{audit.map((a, i) => <li key={i}>{formatDateTime(a.at)} · {a.email ?? "—"} · {a.action}</li>)}{audit.length === 0 && <li className="text-ink-3">Nenhum registro.</li>}</ul>
    </>
  );
}
