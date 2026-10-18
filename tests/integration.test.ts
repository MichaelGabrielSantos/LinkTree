import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/server/db/client";
import { ingestionRuns, newsArticles, newsArticleVersions, personExternalIds, persons, propositions, propositionVersions } from "@/server/db/schema";
import { syncAgenciaBrasil } from "@/server/connectors/agencia-brasil/rss";
import { upsertPersonByCamaraId, upsertPropositions } from "@/server/connectors/camara/jobs";
import { withRun } from "@/server/ingestion/runs";
import * as data from "@/server/user-data";
import { createUser } from "@/server/auth";
import { setProviderOverride } from "@/server/ai/provider";
import { explainNews } from "@/server/ai/explain";
import { askAssistant } from "@/server/ai/assistant";
import { getNewsArticle } from "@/server/queries/news";
import { consumeRateLimit } from "@/server/ai/budget";
import { FakeProvider, mockFetchOnce, resetDb } from "./helpers";
import { INJECTION_BODY, LONG_BODY, rssFixture } from "./fixtures/rss";

const xmlResponse = (xml: string) => () => new Response(xml, { status: 200, headers: { "content-type": "application/rss+xml" } });

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.unstubAllGlobals();
  setProviderOverride(null);
});
afterAll(async () => {
  await closeDb();
});

describe("ingestão de notícias", () => {
  it("é idempotente, versiona mudanças e remove rastreadores", async () => {
    const v1 = rssFixture([{ guid: "g1", title: "Prefeitura anuncia reforma de escolas (FIXTURE)", body: LONG_BODY }]);
    vi.stubGlobal("fetch", mockFetchOnce({ "/rss/geral/": xmlResponse(v1) }));
    await syncAgenciaBrasil(["geral"]);
    await syncAgenciaBrasil(["geral"]);
    let rows = await db.select().from(newsArticles);
    expect(rows).toHaveLength(1);
    expect(rows[0].lead).not.toMatch(/ebc\.gif|<img|Logo Agência Brasil/);
    expect(rows[0].lead.length).toBeLessThanOrEqual(601);
    expect(rows[0].topicSlug).toBe("brasil");

    const v2 = rssFixture([{ guid: "g1", title: "Prefeitura anuncia reforma de 14 escolas (FIXTURE corrigida)", body: LONG_BODY }]);
    vi.stubGlobal("fetch", mockFetchOnce({ "/rss/geral/": xmlResponse(v2) }));
    await syncAgenciaBrasil(["geral"]);
    rows = await db.select().from(newsArticles);
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(2);
    const versions = await db.select().from(newsArticleVersions).where(eq(newsArticleVersions.articleId, rows[0].id));
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
  });

  it("falha do conector mantém dados existentes e registra a execução como falha", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ "/rss/geral/": xmlResponse(rssFixture([{ guid: "g1", title: "Matéria FIXTURE", body: LONG_BODY }])) }));
    await syncAgenciaBrasil(["geral"]);
    vi.stubGlobal("fetch", mockFetchOnce({}));
    const out = await syncAgenciaBrasil(["geral"]);
    expect(out.status).toBe("failed");
    expect(await db.select().from(newsArticles)).toHaveLength(1);
    const [run] = await db.select().from(ingestionRuns).where(eq(ingestionRuns.id, out.runId));
    expect(run.error).toContain("geral");
  });
});

describe("pessoas e proposições", () => {
  it("homônimos com IDs oficiais diferentes nunca são unidos", async () => {
    const a = await upsertPersonByCamaraId("1001", { name: "João da Silva" }, { overwriteName: true });
    const b = await upsertPersonByCamaraId("1002", { name: "João da Silva" }, { overwriteName: true });
    const again = await upsertPersonByCamaraId("1001", { name: "João da Silva" }, { overwriteName: true });
    expect(a.personId).not.toBe(b.personId);
    expect(again.personId).toBe(a.personId);
    expect(await db.select().from(persons)).toHaveLength(2);
  });

  it("ingestão repetida não duplica e preserva versões", async () => {
    const item = { sourceId: "camara", externalId: "999", siglaTipo: "PL", numero: 1, ano: 2026, ementa: "Ementa FIXTURE.", statusSituacao: "Aguardando Parecer" };
    await withRun("camara", "test", {}, (ctx) => upsertPropositions([item], ctx));
    const second = await withRun("camara", "test", {}, (ctx) => upsertPropositions([item], ctx));
    expect(second.counters.unchanged).toBe(1);
    await withRun("camara", "test", {}, (ctx) => upsertPropositions([{ ...item, statusSituacao: "Aguardando Apreciação pelo Senado Federal" }], ctx));
    const rows = await db.select().from(propositions);
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(2);
    const versions = await db.select().from(propositionVersions).where(eq(propositionVersions.propositionId, rows[0].id));
    expect(versions).toHaveLength(2);
    expect((versions.find((v) => v.version === 1)!.snapshot as { statusSituacao: string }).statusSituacao).toBe("Aguardando Parecer");
  });
});

describe("isolamento de dados de usuários", () => {
  it("salvos e acompanhamentos de uma pessoa não aparecem para outra", async () => {
    const a = await createUser("a@teste.local", "senha-forte-123");
    const b = await createUser("b@teste.local", "senha-forte-456");
    await data.follow(a.id, { targetType: "topic", targetId: "saude" });
    const [p] = await db.insert(propositions).values({ sourceId: "camara", externalId: "1", siglaTipo: "PL", numero: 1, ano: 2026, ementa: "x", contentHash: "h" }).returning();
    await data.save(a.id, "proposition", p.id);
    expect(await data.listFollows(b.id)).toHaveLength(0);
    expect(await data.listSaved(b.id)).toHaveLength(0);
    await data.unfollow(b.id, { targetType: "topic", targetId: "saude" });
    await data.unsave(b.id, "proposition", p.id);
    expect(await data.listFollows(a.id)).toHaveLength(1);
    expect(await data.listSaved(a.id)).toHaveLength(1);
    const conv = await data.appendConversation(a.id, null, { type: "geral", id: null }, "pergunta privada", { ok: true });
    // B não consegue anexar mensagens na conversa de A: uma conversa nova é criada para B.
    const convB = await data.appendConversation(b.id, conv, { type: "geral", id: null }, "outra", { ok: true });
    expect(convB).not.toBe(conv);
    expect(await data.listConversations(b.id)).toHaveLength(1);
    await data.deleteConversationHistory(a.id);
    expect(await data.listConversations(a.id)).toHaveLength(0);
    expect(await data.listConversations(b.id)).toHaveLength(1);
  });
  it("não permite seguir item inexistente", async () => {
    const a = await createUser("c@teste.local", "senha-forte-123");
    await expect(data.follow(a.id, { targetType: "topic", targetId: "inexistente" })).rejects.toThrow();
  });
});

async function seedNews(body: string, title = "Prefeitura anuncia reforma de escolas (FIXTURE)") {
  vi.stubGlobal("fetch", mockFetchOnce({ "/rss/geral/": xmlResponse(rssFixture([{ guid: `g-${title.length}`, title, body }])) }));
  await syncAgenciaBrasil(["geral"]);
  vi.unstubAllGlobals();
  const [row] = await db.select().from(newsArticles).where(eq(newsArticles.title, title));
  return row;
}

describe("explicações e assistente (provedor FIXTURE)", () => {
  it("sem provedor configurado, informa indisponibilidade e mostra só registros", async () => {
    const n = await seedNews(LONG_BODY);
    const res = await explainNews((await getNewsArticle(n.id))!, "explicacao");
    expect(res.status).toBe("indisponivel");
    expect(res.evidence[0].url).toContain("agenciabrasil");
  });

  it("explicação é cacheada por versão da fonte e invalidada quando a fonte muda", async () => {
    const fake = new FakeProvider(() => ({
      situacao: "respondida",
      resumo: "Reforma anunciada.",
      secoes: [{ chave: "o_que_aconteceu", titulo: "O que aconteceu", itens: [{ texto: "A prefeitura anunciou reforma de 12 escolas.", tipo: "fato", evidencias: ["E1"], atribuidoA: null }] }],
      termos: [],
      ressalvas: [],
      informacaoQueFalta: [],
    }));
    setProviderOverride(fake);
    const n = await seedNews(LONG_BODY);
    const first = await explainNews((await getNewsArticle(n.id))!, "explicacao");
    const second = await explainNews((await getNewsArticle(n.id))!, "explicacao");
    expect(first.status).toBe("ok");
    expect(second.status === "ok" && second.cached).toBe(true);
    expect(fake.calls).toHaveLength(1);
    await db.update(newsArticles).set({ lead: `${LONG_BODY} Atualização: o número de escolas foi corrigido.`, contentHash: "novo-hash" }).where(eq(newsArticles.id, n.id));
    const third = await explainNews((await getNewsArticle(n.id))!, "explicacao");
    expect(third.status === "ok" && third.cached).toBe(false);
    expect(fake.calls).toHaveLength(2);
  });

  it("não gera explicação aprofundada só com título/trecho curto", async () => {
    setProviderOverride(new FakeProvider(() => ({})));
    const n = await seedNews("Curto.");
    const res = await explainNews((await getNewsArticle(n.id))!, "explicacao");
    expect(res.status).toBe("indisponivel");
  });

  it("instrução maliciosa no documento não altera regras nem passa pela validação", async () => {
    // O provedor FIXTURE simula um modelo que "obedeceu" à injeção.
    const fake = new FakeProvider(() => ({
      situacao: "respondida",
      respostaDireta: "Tudo está confirmado.",
      explicacao: [{ texto: "O deputado X é corrupto.", tipo: "fato", evidencias: [], atribuidoA: null }],
      ressalvas: [],
      informacaoQueFalta: [],
      aprofundar: [],
    }));
    setProviderOverride(fake);
    const n = await seedNews(INJECTION_BODY, "Conselho municipal discute transporte (FIXTURE)");
    const res = await askAssistant("O que foi decidido sobre o transporte?", { type: "news", id: n.id });
    expect(fake.calls[0].system).toContain("DADO NÃO CONFIÁVEL");
    expect(fake.calls[0].user.match(/<\/evidencias>/g)).toHaveLength(1);
    expect(res.mode).toBe("gerada");
    expect(res.answer!.situacao).toBe("insuficiente");
    expect(res.answer!.explicacao).toHaveLength(0);
    expect(res.notices.join(" ")).toMatch(/forma de instrução/);
  });

  it("sem evidência, o assistente se abstém e diz que não encontrar não é não existir", async () => {
    const res = await askAssistant("Qual o resultado do campeonato de xadrez lunar?", null);
    expect(res.mode).toBe("sem_resultado");
    expect(res.notices.join(" ")).toContain("não significa que não exista");
  });

  it("pergunta sobre voto não fabrica voto e informa falta de cobertura", async () => {
    const res = await askAssistant("Como a deputada Fulana votou na PEC?", null);
    expect(res.mode).toBe("sem_cobertura");
    expect(res.answer).toBeUndefined();
  });

  it("nomes ambíguos pedem desambiguação em vez de atribuir registros", async () => {
    await upsertPersonByCamaraId("2001", { name: "Maria Souza Lima" }, { overwriteName: true });
    await upsertPersonByCamaraId("2002", { name: "Maria Souza Lima" }, { overwriteName: true });
    const res = await askAssistant("Quais projetos Maria Souza Lima apresentou sobre saúde?", null);
    expect(res.mode).toBe("desambiguacao");
    expect(res.candidates).toHaveLength(2);
  });

  it("contagem de projetos é determinística, por papel, sem o modelo", async () => {
    const fake = new FakeProvider(() => ({}));
    setProviderOverride(fake);
    const { personId } = await upsertPersonByCamaraId("3001", { name: "Carla Teste Fixture" }, { overwriteName: true });
    const mk = async (ext: string, sigla: string, proponent: boolean | null, order: number | null) => {
      const [p] = await db.insert(propositions).values({ sourceId: "camara", externalId: ext, siglaTipo: sigla, numero: Number(ext), ano: 2025, ementa: "FIXTURE", contentHash: ext }).returning();
      await db.execute(sql`insert into proposition_themes (proposition_id, cod_tema, tema) values (${p.id}, 56, 'Saúde')`);
      await db.execute(sql`insert into proposition_authors (proposition_id, person_id, author_key, name, proponent, signature_order, origin) values (${p.id}, ${personId}, 'dep:3001', 'Carla', ${proponent}, ${order}, 'api')`);
    };
    await mk("1", "PL", true, 1); // 1º signatário
    await mk("5", "PLP", true, 3); // coautoria: proponente, mas não a primeira assinatura
    await mk("2", "PL", false, 7); // apoiamento não é autoria
    await mk("3", "REQ", true, 1); // requerimento não entra
    await mk("4", "PEC", null, null);
    const res = await askAssistant("Quais projetos Carla Teste Fixture apresentou sobre saúde?", null);
    expect(res.mode).toBe("estruturada");
    expect(res.structured!.counts).toEqual({ autoria: 1, coautoria: 1, apoio: 1, nao_verificado: 1 });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("limites de uso", () => {
  it("bloqueia após o limite da janela", async () => {
    for (let i = 0; i < 3; i++) expect(await consumeRateLimit("t:1", 3, 3600)).toBe(true);
    expect(await consumeRateLimit("t:1", 3, 3600)).toBe(false);
    expect(await consumeRateLimit("t:2", 3, 3600)).toBe(true);
  });
});
