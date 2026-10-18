import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { sources, topics, type SourcePermissions } from "@/server/db/schema";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { DIVERSITY_PENALTY, EVIDENCE_FULL_CHARS, RANKING_VERSION, RECENCY_HALF_LIFE_H, WEIGHTS } from "@/domain/ranking";
import { GLOSSARY, GLOSSARY_VERSION } from "@/domain/glossary";
import { PROMPT_VERSION } from "@/server/ai/grounding";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Metodologia e fontes" };
export const dynamic = "force-dynamic";

const PERM_LABEL: Record<string, string> = { nenhum: "nenhum", metadados: "só metadados", trecho: "só trecho", integral: "integral", nao: "não", link: "apenas link", exibir_com_credito: "exibir com crédito" };

export default async function MetodologiaPage() {
  const [src, tps] = await Promise.all([db.select().from(sources).orderBy(asc(sources.name)), db.select().from(topics).orderBy(asc(topics.sortOrder))]);
  return (
    <>
      <PageHeader title="Metodologia e fontes">Como o Contexto escolhe, ordena, explica e cita. Buscamos tratamento consistente entre partidos e pessoas, mas não prometemos ausência absoluta de viés.</PageHeader>

      <SectionTitle id="principios">Princípios</SectionTitle>
      <ul className="ml-5 list-disc space-y-1 text-ink-2">
        <li>Cada afirmação factual gerada por IA aponta para um documento recuperado. Um verificador automático remove itens sem fonte, com fonte inexistente ou com números que não aparecem nas fontes citadas.</li>
        <li>Separamos fato registrado, alegação atribuída, interpretação, projeção e exemplo hipotético.</li>
        <li>Quando os documentos não bastam, dizemos que não foi possível verificar. “Não encontrei” não significa “não existe”.</li>
        <li>Contagens (projetos, autoria) são consultas ao banco, nunca cálculos do modelo, e informam filtros, período e cobertura.</li>
        <li>Comunicados oficiais e declarações de políticos são alegações atribuídas. Não equiparamos evidências de força diferente nem inventamos controvérsia.</li>
        <li>Não recomendamos candidatos e não adaptamos conclusões ao posicionamento de quem pergunta. Não inferimos posicionamento político de ninguém.</li>
        <li>Textos de matérias e documentos são tratados como dados, nunca como instruções ao assistente.</li>
      </ul>

      <SectionTitle id="panorama">Ordenação do panorama ({RANKING_VERSION})</SectionTitle>
      <Card>
        <p className="text-sm">Escolha editorial do produto, igual para todas as pessoas. Não usa engajamento, cliques, orientação política inferida nem dados pessoais.</p>
        <p className="mt-3 rounded-lg bg-surface-2 p-3 font-mono text-sm [overflow-wrap:anywhere]">
          pontuação = {WEIGHTS.recency}·atualidade + {WEIGHTS.reach}·alcance + {WEIGHTS.publicRelevance}·relevância pública + {WEIGHTS.evidence}·evidência − {DIVERSITY_PENALTY}·(itens do mesmo tema já acima)
        </p>
        <ul className="ml-5 mt-3 list-disc space-y-1 text-sm text-ink-2">
          <li><strong>Atualidade</strong>: meia-vida de {RECENCY_HALF_LIFE_H} horas desde a publicação.</li>
          <li><strong>Alcance</strong>: quantas matérias e veículos tratam do mesmo acontecimento (satura em 5 matérias / 3 veículos). Com uma única fonte integrada, este fator ainda discrimina pouco.</li>
          <li><strong>Relevância pública</strong>: peso editorial por tema (tabela abaixo).</li>
          <li><strong>Evidência disponível</strong>: quanto texto verificável a fonte oferece (satura em {EVIDENCE_FULL_CHARS} caracteres).</li>
          <li><strong>Diversidade</strong>: penalidade para evitar que um só tema domine o topo.</li>
        </ul>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-sm">
          <caption className="sr-only">Pesos de relevância pública por tema</caption>
          <thead><tr className="text-left text-ink-3"><th className="py-1">Tema</th><th>Peso</th><th>Fonte de notícias</th></tr></thead>
          <tbody>{tps.map((t) => <tr key={t.slug} className="border-t border-line"><td className="py-1">{t.name}</td><td>{t.publicRelevanceWeight}</td><td>{t.newsCategories.length ? t.newsCategories.join(", ") : "nenhuma ainda"}</td></tr>)}</tbody>
        </table></div>
        <p className="mt-2 text-xs text-ink-3">Agrupamento de acontecimentos: semelhança de título (Jaccard ≥ 0,5 entre palavras de conteúdo), janela de 3 dias. Preferimos não agrupar a agrupar errado; as matérias agrupadas continuam visíveis.</p>
      </Card>

      <SectionTitle id="fontes">Catálogo de fontes</SectionTitle>
      <div className="space-y-3">
        {src.map((s) => {
          const p = s.permissions as SourcePermissions;
          return (
            <Card key={s.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-serif text-lg">{s.name}</h3>
                <Badge tone={s.status === "ativo" ? "ok" : s.status === "restrito" ? "warn" : "neutral"}>{s.status}</Badge>
                <Badge>{s.kind}</Badge>
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm [overflow-wrap:anywhere] sm:grid-cols-[12rem_1fr]">
                <dt className="text-ink-3">Cobertura</dt><dd>{s.coverage}</dd>
                <dt className="text-ink-3">Acesso</dt><dd>{s.accessMethod}{s.credentialsRequired ? " (exige credencial)" : ""}</dd>
                <dt className="text-ink-3">Atualização</dt><dd>{s.updateFrequency}</dd>
                <dt className="text-ink-3">Termos consultados</dt><dd>{s.termsUrl ? <a className="underline" href={s.termsUrl} target="_blank" rel="noopener noreferrer">{s.termsUrl}</a> : "—"}{s.termsCheckedAt ? ` em ${formatDate(s.termsCheckedAt)}` : " (não revisados)"}</dd>
                <dt className="text-ink-3">Resumo dos termos</dt><dd>{s.termsSummary}</dd>
                <dt className="text-ink-3">Atribuição</dt><dd>{s.attribution}</dd>
                <dt className="text-ink-3">Operações permitidas</dt>
                <dd>Texto integral: {p.reproduceFullText ? "sim" : "não"} · armazenar bruto: {p.storeRaw ? "sim" : "não"} · indexação: {PERM_LABEL[p.index]} · processamento por IA: {PERM_LABEL[p.aiProcessing]} · imagens: {PERM_LABEL[p.images]}</dd>
                {s.pendingReview && <><dt className="text-ink-3">Pendência</dt><dd className="text-warn-ink">{s.pendingReview}</dd></>}
              </dl>
            </Card>
          );
        })}
      </div>

      <SectionTitle id="ia">Como a IA é usada</SectionTitle>
      <ul className="ml-5 list-disc space-y-1 text-sm text-ink-2">
        <li>Ingestão e geração são separadas: conectores coletam e versionam; a IA só lê documentos já coletados e autorizados.</li>
        <li>Explicações públicas são guardadas por versão das fontes, tipo e versão das instruções ({PROMPT_VERSION}). Se a fonte muda, a explicação antiga deixa de ser usada.</li>
        <li>O modelo não recebe segredos, não acessa a internet e não executa ações. Notícias só são enviadas na forma permitida pela licença (hoje, só o trecho inicial).</li>
        <li>Quando a IA não está configurada ou o limite diário é atingido, mostramos os documentos sem texto gerado.</li>
      </ul>

      <SectionTitle id="glossario">Glossário editorial ({GLOSSARY_VERSION})</SectionTitle>
      <p className="mb-2 text-sm text-ink-2">Explicações gerais sobre procedimentos, escritas pela equipe. Não descrevem casos concretos. Revisão jurídica pendente.</p>
      <dl className="space-y-3">
        {GLOSSARY.map((g) => (
          <div key={g.slug} id={g.slug}>
            <dt className="font-semibold">{g.term}</dt>
            <dd className="text-sm text-ink-2">{g.short} {g.long}{g.reference ? <span className="text-xs text-ink-3"> ({g.reference})</span> : null}</dd>
          </div>
        ))}
      </dl>

      <SectionTitle id="pendencias">Pendências antes de produção</SectionTitle>
      <ul className="ml-5 list-disc space-y-1 text-sm text-ink-2">
        <li>Revisão jurídica do uso de conteúdo da Agência Brasil (finalidade jornalística × comercial).</li>
        <li>Revisão de privacidade (LGPD): bases legais, retenção do histórico de perguntas, encarregado de dados, política de privacidade. Não alegamos conformidade automática.</li>
        <li>Revisão do glossário e das regras de classificação de etapas legislativas por especialista.</li>
      </ul>
    </>
  );
}
