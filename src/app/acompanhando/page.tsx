import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUser } from "@/server/auth";
import { followingUpdates, UPDATE_TYPE_LABEL } from "@/server/queries/following";
import { listFollows } from "@/server/user-data";
import { personsByIds } from "@/server/queries/person";
import { db } from "@/server/db/client";
import { propositions, topics } from "@/server/db/schema";
import { inArray } from "drizzle-orm";
import { FollowButton } from "@/components/actions-ui";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, Tabs } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Acompanhando" };
export const dynamic = "force-dynamic";

export default async function AcompanhandoPage({ searchParams }: { searchParams: Promise<{ periodo?: string; tipo?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    return (
      <>
        <PageHeader title="Acompanhando">Siga políticos, temas e projetos para ver as atualizações reunidas aqui.</PageHeader>
        <EmptyState title="Entre para acompanhar">
          A leitura é livre, sem cadastro. Uma conta só é necessária para guardar o que você segue. <Link href="/perfil?entrar=1&next=/acompanhando" className="underline">Entrar ou criar conta</Link>
        </EmptyState>
      </>
    );
  }
  const days = sp.periodo === "semanal" ? 7 : 1;
  const [{ groups }, fs] = await Promise.all([followingUpdates(user.id, days === 1 ? 2 : 7), listFollows(user.id)]);
  const filtered = sp.tipo ? groups.filter((g) => g.type === sp.tipo) : groups;
  const people = await personsByIds(fs.filter((f) => f.targetType === "person").map((f) => f.targetId));
  const topicRows = await db.select().from(topics);
  const propIds = fs.filter((f) => f.targetType === "proposition").map((f) => f.targetId);
  const props = propIds.length ? await db.select().from(propositions).where(inArray(propositions.id, propIds)) : [];
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ periodo: sp.periodo, tipo: sp.tipo, ...patch })) if (v) q.set(k, v);
    return `/acompanhando?${q.toString()}`;
  };

  return (
    <>
      <PageHeader title="Acompanhando">Atualizações do que você segue, separadas por tipo.</PageHeader>
      <Tabs current={sp.periodo === "semanal" ? "semanal" : "diaria"} items={[{ key: "diaria", label: "Últimas 48 horas", href: href({ periodo: undefined }) }, { key: "semanal", label: "Últimos 7 dias", href: href({ periodo: "semanal" }) }]} />
      <p className="mb-3 flex flex-wrap gap-2 text-sm">
        <Link href={href({ tipo: undefined })} className={!sp.tipo ? "font-semibold underline" : "underline"}>Todos</Link>
        {Object.entries(UPDATE_TYPE_LABEL).map(([k, v]) => <Link key={k} href={href({ tipo: k })} className={sp.tipo === k ? "font-semibold underline" : "underline"}>{v}</Link>)}
      </p>
      {fs.length === 0 ? (
        <EmptyState title="Você ainda não segue nada">Abra o perfil de um político, um tema ou um projeto e toque em “Seguir”. <Link className="underline" href="/explorar">Explorar</Link></EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nada novo neste período">Quando houver novidade verificável, ela aparece aqui. Não preenchemos espaço sem novidade.</EmptyState>
      ) : (
        <div className="space-y-3">
          {filtered.map((g) => (
            <Card key={g.key}>
              <p className="flex flex-wrap items-center gap-2 text-sm"><Badge tone="accent">{UPDATE_TYPE_LABEL[g.type]}</Badge><span className="text-ink-2">{g.because}</span>{g.items.length > 1 && <span className="text-ink-3">· {g.items.length} itens agrupados</span>}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {g.items.slice(0, 5).map((it, i) => <li key={i}><Link href={it.href} className="underline">{it.title}</Link> <span className="text-xs text-ink-3">{formatDateTime(it.at)}</span></li>)}
              </ul>
              {g.items.length > 5 && <details className="mt-1 text-sm"><summary className="cursor-pointer text-ink-2">Mais {g.items.length - 5}</summary><ul className="mt-1 space-y-1">{g.items.slice(5).map((it, i) => <li key={i}><Link href={it.href} className="underline">{it.title}</Link></li>)}</ul></details>}
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>O que você segue</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><p className="text-sm font-semibold">Políticos</p><ul className="mt-2 space-y-2 text-sm">{people.map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><Link className="underline" href={`/politicos/${p.id}`}>{p.name}</Link><FollowButton targetType="person" targetId={p.id} following next="/acompanhando" /></li>)}{people.length === 0 && <li className="text-ink-3">Nenhum.</li>}</ul></Card>
        <Card><p className="text-sm font-semibold">Temas</p><ul className="mt-2 space-y-2 text-sm">{fs.filter((f) => f.targetType === "topic").map((f) => <li key={f.id} className="flex items-center justify-between gap-2"><Link className="underline" href={`/temas/${f.targetId}`}>{topicRows.find((t) => t.slug === f.targetId)?.name ?? f.targetId}</Link><FollowButton targetType="topic" targetId={f.targetId} following next="/acompanhando" /></li>)}</ul>
          <p className="mt-3 text-xs text-ink-3">Seguir um tema:</p>
          <ul className="mt-1 flex flex-wrap gap-1">{topicRows.filter((t) => !fs.some((f) => f.targetType === "topic" && f.targetId === t.slug)).map((t) => <li key={t.slug}><Link className="rounded-full border border-line px-2 py-0.5 text-xs" href={`/temas/${t.slug}`}>{t.name}</Link></li>)}</ul>
        </Card>
        <Card><p className="text-sm font-semibold">Projetos</p><ul className="mt-2 space-y-2 text-sm">{props.map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><Link className="underline" href={`/projetos/${p.id}`}>{p.siglaTipo} {p.numero}/{p.ano}</Link><FollowButton targetType="proposition" targetId={p.id} following next="/acompanhando" /></li>)}{props.length === 0 && <li className="text-ink-3">Nenhum.</li>}</ul></Card>
      </div>
      <p className="mt-4 text-xs text-ink-3">Alertas por e-mail e resumo diário chegam no próximo incremento, sempre com inscrição explícita.</p>
    </>
  );
}
