import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getNewsArticle } from "@/server/queries/news";
import { getCurrentUser } from "@/server/auth";
import { savedIdSet } from "@/server/user-data";
import { SaveButton } from "@/components/actions-ui";
import { ExplainPanel } from "@/components/explain-panel";
import { Assistant } from "@/components/assistant";
import { Badge, Card, Notice, SectionTitle } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { SourcePermissions } from "@/server/db/schema";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const v = await getNewsArticle((await params).id);
  return { title: v?.article.title ?? "Notícia" };
}

export default async function NoticiaPage({ params }: { params: Params }) {
  const { id } = await params;
  const view = await getNewsArticle(id);
  if (!view) notFound();
  const { article: a, source, versions, related } = view;
  const perms = source.permissions as SourcePermissions;
  const user = await getCurrentUser();
  const saved = user ? (await savedIdSet(user.id, "news", [a.id])).has(a.id) : false;
  const limited = a.feedTextLength > a.lead.length || !perms.reproduceFullText;
  const prev = versions[1];

  return (
    <article>
      <p className="text-sm text-ink-3">
        <Link href="/" className="underline">Hoje</Link> / Notícia
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-3">
        {view.topicName && <Badge>{view.topicName}</Badge>}
        <span>{source.name}</span>
        {a.author && <span>· {a.author}</span>}
        {a.version > 1 && <Badge tone="warn">versão {a.version} — alterada pela fonte</Badge>}
      </div>
      <h1 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl">{a.title}</h1>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-ink-3 sm:grid-cols-3">
        <div><dt className="inline">Publicada: </dt><dd className="inline">{formatDateTime(a.publishedAt)}</dd></div>
        <div><dt className="inline">Coletada pelo Imparciali: </dt><dd className="inline">{formatDateTime(a.collectedAt)}</dd></div>
        <div><dt className="inline">Última verificação de mudança: </dt><dd className="inline">{formatDateTime(a.updatedAt)}</dd></div>
      </dl>

      <Card className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Trecho da fonte</p>
        <blockquote className="mt-2 border-l-4 border-line pl-3 text-ink-2">{a.lead}</blockquote>
        <p className="mt-3 text-xs text-ink-3">
          {source.attribution}. {limited ? "Mostramos apenas o trecho inicial: a licença para reproduzir o texto integral não foi confirmada para este produto. " : ""}
          Imagens não são reproduzidas.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">
            Ler a matéria original ↗
          </a>
          <SaveButton itemType="news" itemId={a.id} saved={saved} next={`/noticias/${a.id}`} />
        </div>
      </Card>

      {a.tags.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-1 text-xs">
          {a.tags.map((t) => (
            <Link key={t} href={`/explorar?q=${encodeURIComponent(t)}&aba=noticias`} className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2 hover:underline">#{t}</Link>
          ))}
        </p>
      )}

      <section aria-labelledby="entender" id="entender">
        <SectionTitle id="entender-titulo">Entender</SectionTitle>
        {limited && (
          <div className="mb-3">
            <Notice tone="warn">
              O conteúdo disponível é limitado ao trecho inicial. As explicações só podem usar esse trecho e dirão o que não é possível saber a partir dele.
            </Notice>
          </div>
        )}
        <ExplainPanel
          subject="news"
          id={a.id}
          actions={[
            { kind: "explicacao", label: "Explicar" },
            { kind: "simples", label: "Explique mais simples" },
            { kind: "exemplo", label: "Dê um exemplo do cotidiano" },
            { kind: "argumentos", label: "Quais argumentos e evidências existem?" },
          ]}
        />
      </section>

      <section aria-labelledby="linha-do-tempo">
        <SectionTitle id="linha-do-tempo">Linha do tempo deste acontecimento</SectionTitle>
        {related.length === 0 ? (
          <p className="text-sm text-ink-2">Não há outras matérias agrupadas a este acontecimento na base atual. O agrupamento é conservador (semelhança de título) e só considera os últimos 3 dias.</p>
        ) : (
          <ol className="space-y-2 border-l-2 border-line pl-4 text-sm">
            {[...related, { id: a.id, title: a.title, url: a.url, publishedAt: a.publishedAt, sourceName: source.name }]
              .sort((x, y) => x.publishedAt.getTime() - y.publishedAt.getTime())
              .map((r) => (
                <li key={r.id}>
                  <time className="text-xs text-ink-3">{formatDateTime(r.publishedAt)}</time>
                  <p>{r.id === a.id ? <strong>{r.title} (esta matéria)</strong> : <Link href={`/noticias/${r.id}`} className="underline">{r.title}</Link>} <span className="text-ink-3">— {r.sourceName}</span></p>
                </li>
              ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="mudancas">
        <SectionTitle id="mudancas">O que mudou desde a última atualização</SectionTitle>
        {prev ? (
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <Card>
              <p className="text-xs text-ink-3">Versão {prev.version} · coletada em {formatDateTime(prev.collectedAt)}</p>
              <p className="mt-1 font-semibold">{prev.title}</p>
              <p className="mt-1 text-ink-2">{prev.lead}</p>
            </Card>
            <Card>
              <p className="text-xs text-ink-3">Versão {versions[0].version} (atual) · coletada em {formatDateTime(versions[0].collectedAt)}</p>
              <p className="mt-1 font-semibold">{versions[0].title}</p>
              <p className="mt-1 text-ink-2">{versions[0].lead}</p>
            </Card>
          </div>
        ) : (
          <p className="text-sm text-ink-2">Nenhuma alteração detectada no título ou no trecho desde a primeira coleta.</p>
        )}
      </section>

      <div className="mt-8">
        <Assistant context={{ type: "news", id: a.id }} title="Perguntar sobre esta notícia" suggestions={["O que isso significa na prática?", "Quem está envolvido?", "Há projetos de lei sobre esse assunto?"]} />
      </div>
    </article>
  );
}
