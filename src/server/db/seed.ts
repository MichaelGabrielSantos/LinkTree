import { sql } from "drizzle-orm";
import { db } from "./client";
import { sources, topics, type SourcePermissions } from "./schema";

/**
 * Catálogo de fontes. Cada entrada registra o que foi efetivamente consultado e quando.
 * Atualize `termsCheckedAt` e `pendingReview` sempre que reler os termos.
 */
export const SOURCE_CATALOG: Array<typeof sources.$inferInsert> = [
  {
    id: "camara",
    name: "Câmara dos Deputados — Dados Abertos",
    kind: "oficial",
    coverage:
      "Deputados federais (legislaturas 56 e 57 sincronizadas), proposições, autores, temas e tramitações. Arquivos anuais de proposições/autores a partir de 2019.",
    accessMethod:
      "API REST v2 (https://dadosabertos.camara.leg.br/api/v2, swagger em /swagger/api.html) e arquivos anuais em https://dadosabertos.camara.leg.br/arquivos/",
    credentialsRequired: false,
    updateFrequency: "API: contínua. Arquivos anuais: regenerados diariamente (cabeçalho Last-Modified).",
    termsUrl: "https://dadosabertos.camara.leg.br/swagger/api.html",
    termsCheckedAt: "2026-10-18",
    termsSummary:
      "Dados publicados como dados abertos, sem autenticação. A página de termos não pôde ser lida sem JavaScript; nenhuma licença específica foi verificada. A API retorna CPF no detalhe do deputado — o Contexto não armazena esse campo. O inteiro teor (PDF em www.camara.leg.br) respondeu HTTP 429 a clientes identificados como robô em 2026-10-18; não contornamos o bloqueio.",
    attribution: "Fonte: Câmara dos Deputados — Dados Abertos",
    permissions: {
      reproduceFullText: true,
      storeRaw: true,
      index: "integral",
      aiProcessing: "integral",
      images: "exibir_com_credito",
    } satisfies SourcePermissions,
    status: "ativo",
    pendingReview:
      "Confirmar termos de uso e limites de requisição oficiais da API. Solicitar à Câmara via oficial para coleta automatizada do inteiro teor (hoje bloqueada com HTTP 429 para robôs identificados).",
  },
  {
    id: "agencia-brasil",
    name: "Agência Brasil (EBC) — RSS",
    kind: "noticia",
    coverage:
      "Notícias das editorias Política, Economia, Geral, Internacional, Saúde, Educação, Meio Ambiente, Direitos Humanos, Justiça, Cultura e Esportes. Não há feed próprio de ciência/tecnologia.",
    accessMethod: "RSS 2.0 em https://agenciabrasil.ebc.com.br/rss/{editoria}/feed.xml",
    credentialsRequired: false,
    updateFrequency: "Coleta a cada execução agendada (recomendado: 30 min). Feed traz ~10 itens por editoria.",
    termsUrl: "https://agenciabrasil.ebc.com.br/sobre",
    termsCheckedAt: "2026-10-18",
    termsSummary:
      "Política de reprodução: \"Reprodução autorizada para veículos de comunicação com fins jornalísticos, mediante indicação da fonte\". Reproduções com fins comerciais exigem contato com licenciamento@ebc.com.br. Conteúdos de parceiros podem seguir outra política.",
    attribution: "Fonte: Agência Brasil",
    permissions: {
      // Enquadramento do Contexto como "veículo com fins jornalísticos" não verificado:
      // por cautela, exibimos e processamos apenas o trecho inicial e encaminhamos ao original.
      reproduceFullText: false,
      storeRaw: false,
      index: "trecho",
      aiProcessing: "trecho",
      images: "link",
    } satisfies SourcePermissions,
    status: "restrito",
    pendingReview:
      "Revisão jurídica: o Contexto se enquadra como veículo com fins jornalísticos? Uso comercial exige licença. Até lá: só metadados e trecho inicial.",
  },
  {
    id: "senado",
    name: "Senado Federal — Dados Abertos",
    kind: "oficial",
    coverage: "Ainda não integrado (incremento 2).",
    accessMethod: "https://legis.senado.leg.br/dadosabertos/ (XML/JSON). Disponibilidade verificada em 2026-10-18.",
    updateFrequency: "—",
    termsUrl: "https://www12.senado.leg.br/dados-abertos",
    termsSummary: "Não revisado ainda.",
    attribution: "Fonte: Senado Federal — Dados Abertos",
    permissions: { reproduceFullText: false, storeRaw: false, index: "metadados", aiProcessing: "nenhum", images: "nao" },
    status: "pendente",
    pendingReview: "Integração prevista para o incremento 2.",
  },
  {
    id: "tse",
    name: "TSE — Dados Abertos",
    kind: "oficial",
    coverage: "Não integrado (incremento 3).",
    accessMethod: "https://dadosabertos.tse.jus.br/",
    updateFrequency: "—",
    termsUrl: "https://dadosabertos.tse.jus.br/",
    termsSummary: "Não revisado ainda.",
    attribution: "Fonte: Tribunal Superior Eleitoral",
    permissions: { reproduceFullText: false, storeRaw: false, index: "metadados", aiProcessing: "nenhum", images: "nao" },
    status: "pendente",
    pendingReview: "Integração prevista para o incremento 3.",
  },
  {
    id: "transparencia",
    name: "Portal da Transparência — API",
    kind: "oficial",
    coverage: "Não integrado (incremento 3).",
    accessMethod: "https://api.portaldatransparencia.gov.br/swagger-ui/index.html — exige chave de API.",
    credentialsRequired: true,
    updateFrequency: "—",
    termsUrl: "https://api.portaldatransparencia.gov.br/swagger-ui/index.html",
    termsSummary: "Não revisado ainda. Requer cadastro para obter token.",
    attribution: "Fonte: Portal da Transparência (CGU)",
    permissions: { reproduceFullText: false, storeRaw: false, index: "metadados", aiProcessing: "nenhum", images: "nao" },
    status: "pendente",
    pendingReview: "Integração prevista para o incremento 3.",
  },
];

/**
 * Taxonomia de temas. Os pesos de relevância pública entram na ordenação do panorama
 * e são publicados em /metodologia. São escolha editorial do produto, não verdade objetiva.
 */
export const TOPIC_TAXONOMY: Array<typeof topics.$inferInsert> = [
  { slug: "politica", name: "Política", description: "Governo, Congresso, partidos e eleições.", publicRelevanceWeight: 1.0, newsCategories: ["Política"], camaraThemeCodes: [53, 74, 34, 68], sortOrder: 1 },
  { slug: "economia", name: "Economia", description: "Emprego, preços, contas públicas, empresas.", publicRelevanceWeight: 1.0, newsCategories: ["Economia"], camaraThemeCodes: [40, 66, 70, 58, 52], sortOrder: 2 },
  { slug: "brasil", name: "Brasil", description: "Acontecimentos gerais no país.", publicRelevanceWeight: 0.9, newsCategories: ["Geral"], camaraThemeCodes: [41, 61], sortOrder: 3 },
  { slug: "mundo", name: "Mundo", description: "Notícias internacionais e relações exteriores.", publicRelevanceWeight: 0.9, newsCategories: ["Internacional"], camaraThemeCodes: [55], sortOrder: 4 },
  { slug: "saude", name: "Saúde", description: "Saúde pública, doenças, SUS.", publicRelevanceWeight: 1.0, newsCategories: ["Saúde"], camaraThemeCodes: [56], sortOrder: 5 },
  { slug: "educacao", name: "Educação", description: "Escolas, universidades, políticas educacionais.", publicRelevanceWeight: 0.95, newsCategories: ["Educação"], camaraThemeCodes: [46], sortOrder: 6 },
  { slug: "meio-ambiente", name: "Meio ambiente", description: "Clima, biomas, energia e desenvolvimento sustentável.", publicRelevanceWeight: 0.95, newsCategories: ["Meio Ambiente"], camaraThemeCodes: [48, 54], sortOrder: 7 },
  { slug: "justica", name: "Justiça", description: "Tribunais, segurança pública e direitos.", publicRelevanceWeight: 0.95, newsCategories: ["Justiça"], camaraThemeCodes: [43, 57, 76, 42], sortOrder: 8 },
  { slug: "direitos-humanos", name: "Direitos humanos", description: "Direitos de grupos e minorias, assistência.", publicRelevanceWeight: 0.95, newsCategories: ["Direitos Humanos"], camaraThemeCodes: [44], sortOrder: 9 },
  { slug: "ciencia-tecnologia", name: "Ciência e tecnologia", description: "Pesquisa, inovação, internet e comunicações.", publicRelevanceWeight: 0.9, newsCategories: [], camaraThemeCodes: [62, 37, 85], sortOrder: 10 },
  { slug: "cultura", name: "Cultura", description: "Arte, cultura e religião.", publicRelevanceWeight: 0.7, newsCategories: ["Cultura"], camaraThemeCodes: [35, 60], sortOrder: 11 },
  { slug: "esportes", name: "Esportes", description: "Esporte e lazer.", publicRelevanceWeight: 0.6, newsCategories: ["Esportes"], camaraThemeCodes: [39], sortOrder: 12 },
  { slug: "agro", name: "Agropecuária", description: "Agricultura, pecuária, pesca e terra.", publicRelevanceWeight: 0.85, newsCategories: [], camaraThemeCodes: [64, 51], sortOrder: 13 },
];

export async function seedReferenceData() {
  for (const s of SOURCE_CATALOG) {
    await db
      .insert(sources)
      .values(s)
      .onConflictDoUpdate({ target: sources.id, set: { ...s, updatedAt: sql`now()` } });
  }
  for (const t of TOPIC_TAXONOMY) {
    await db.insert(topics).values(t).onConflictDoUpdate({ target: topics.slug, set: t });
  }
}
