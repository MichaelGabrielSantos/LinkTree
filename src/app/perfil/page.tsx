import Link from "next/link";
import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { topics } from "@/server/db/schema";
import { getCurrentUser } from "@/server/auth";
import { getPreferences, listConversations, listSaved } from "@/server/user-data";
import { deleteAccountAction, deleteHistoryAction, logoutAction, preferencesAction } from "@/app/actions";
import { LoginForm, SignupForm } from "@/components/auth-forms";
import { Card, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Perfil e preferências" };
export const dynamic = "force-dynamic";

type SP = Promise<{ next?: string; salvo?: string; historico?: string; erro?: string }>;

export default async function PerfilPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/perfil";
  const user = await getCurrentUser();
  if (!user) {
    return (
      <>
        <PageHeader title="Perfil">Leitura, pesquisa e perguntas funcionam sem conta. A conta serve para guardar o que você segue, itens salvos e preferências.</PageHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card><h2 className="mb-3 font-serif text-lg">Entrar</h2><LoginForm next={next} /></Card>
          <Card><h2 className="mb-3 font-serif text-lg">Criar conta</h2><SignupForm next={next} />
            <p className="mt-3 text-xs text-ink-3">Criar conta não inscreve você em nenhuma newsletter. Guardamos e-mail, senha (com hash), o que você segue e salva, e o histórico de perguntas — que você pode apagar a qualquer momento.</p>
          </Card>
        </div>
        <EducationCard />
      </>
    );
  }
  const [topicRows, prefs, saved, convs] = await Promise.all([
    db.select().from(topics).orderBy(asc(topics.sortOrder)),
    getPreferences(user.id),
    listSaved(user.id),
    listConversations(user.id),
  ]);
  return (
    <>
      <PageHeader title="Perfil e preferências">Conectado como {user.email}{user.role === "admin" ? " · administração" : ""}.</PageHeader>
      {sp.salvo && <Notice tone="ok">Preferências salvas.</Notice>}
      {sp.historico === "apagado" && <Notice tone="ok">Histórico de perguntas apagado.</Notice>}
      {sp.erro === "confirmacao" && <Notice tone="error">Para excluir a conta, digite EXCLUIR no campo de confirmação.</Notice>}
      <div className="mt-3 flex flex-wrap gap-2">
        {user.role === "admin" && <Link href="/admin" className="rounded-lg border border-line px-3 py-1.5 text-sm">Painel administrativo</Link>}
        <form action={logoutAction}><button className="rounded-lg border border-line px-3 py-1.5 text-sm">Sair</button></form>
      </div>

      <SectionTitle>Temas em “Hoje”</SectionTitle>
      <form action={preferencesAction}>
        <fieldset>
          <legend className="mb-2 text-sm text-ink-2">Escolha os temas do panorama. Nenhum marcado = todos. Isso só filtra o que você vê; não muda a ordenação para outras pessoas.</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {topicRows.map((t) => (
              <label key={t.slug} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                <input type="checkbox" name="categories" value={t.slug} defaultChecked={prefs.categories.includes(t.slug)} />
                {t.name}{t.newsCategories.length === 0 && <span className="text-xs text-ink-3">(sem fonte ainda)</span>}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">Salvar preferências</button>
      </form>

      <SectionTitle>Salvos</SectionTitle>
      {saved.length === 0 ? <p className="text-sm text-ink-2">Nada salvo ainda.</p> : (
        <ul className="space-y-1 text-sm">{saved.map((s) => <li key={`${s.item_type}-${s.item_id}`}><Link className="underline" href={s.item_type === "news" ? `/noticias/${s.item_id}` : `/projetos/${s.item_id}`}>{s.title ?? "(item removido da fonte)"}</Link> <span className="text-xs text-ink-3">{formatDateTime(s.created_at)}</span></li>)}</ul>
      )}

      <SectionTitle>Histórico de perguntas (privado)</SectionTitle>
      {convs.length === 0 ? <p className="text-sm text-ink-2">Nenhuma conversa registrada.</p> : (
        <>
          <ul className="space-y-1 text-sm">{convs.map((c) => <li key={c.id}>{c.first_question ?? "(sem texto)"} <span className="text-xs text-ink-3">· {c.context_type} · {formatDateTime(c.created_at)} · {c.n} mensagens</span></li>)}</ul>
          <form action={deleteHistoryAction} className="mt-3"><button className="rounded-lg border border-line px-3 py-1.5 text-sm">Apagar todo o histórico</button></form>
        </>
      )}

      <EducationCard />

      <SectionTitle>Excluir conta</SectionTitle>
      <form action={deleteAccountAction} className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1"><span>Digite EXCLUIR para confirmar</span><input name="confirm" className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
        <button className="rounded-lg bg-err-bg px-3 py-2 font-semibold text-err-ink">Excluir conta e dados</button>
      </form>
      <p className="mt-2 text-xs text-ink-3">Remove conta, acompanhamentos, salvos, preferências e histórico. Registros de uso agregado de IA não contêm suas perguntas.</p>
    </>
  );
}

function EducationCard() {
  return (
    <section aria-labelledby="teste" className="mt-8">
      <h2 id="teste" className="font-serif text-xl">Teste de posicionamento político (opcional)</h2>
      <Card className="mt-2">
        <p className="text-sm text-ink-2">
          Uma ferramenta educativa de autorrelato, por dimensões separadas (papel do Estado, redistribuição, liberdades civis, segurança e garantias, meio ambiente),
          com metodologia publicada. Ainda não está disponível: entra no incremento 3, depois do núcleo de informação, após revisão das perguntas.
          Quando existir, será opcional, funcionará sem conta, ficará só no seu aparelho por padrão e nunca influenciará notícias, ordenação ou respostas.
        </p>
      </Card>
    </section>
  );
}
