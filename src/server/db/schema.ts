import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** tsvector mantido por coluna gerada (ver migração custom 0001). */
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

// ───────────────────────── Usuários, sessões, preferências ─────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)]);

export const sessions = pgTable("sessions", {
  /** sha256 do token; o token em si só existe no cookie httpOnly. */
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  /** slugs de `topics` que a pessoa quer ver em "Hoje". Vazio = todos. */
  categories: text("categories").array().notNull().default(sql`'{}'::text[]`),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Consentimentos explícitos (newsletter, sincronização do teste etc.). Histórico append-only. */
export const consents = pgTable("consents", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  granted: boolean("granted").notNull(),
  policyVersion: text("policy_version").notNull(),
  createdAt: createdAt(),
}, (t) => [index("consents_user_kind_idx").on(t.userId, t.kind)]);

// ───────────────────────── Fontes e ingestão ─────────────────────────

export type SourcePermissions = {
  /** Exibir texto integral ao usuário. */
  reproduceFullText: boolean;
  /** Guardar o documento bruto. */
  storeRaw: boolean;
  /** Indexar para busca (metadados/trechos). */
  index: "metadados" | "trecho" | "integral";
  /** O que pode ser enviado ao modelo de IA. */
  aiProcessing: "nenhum" | "metadados" | "trecho" | "integral";
  /** Uso de imagens da fonte. */
  images: "nao" | "link" | "exibir_com_credito";
};

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["oficial", "noticia", "indicador"] }).notNull(),
  coverage: text("coverage").notNull(),
  accessMethod: text("access_method").notNull(),
  credentialsRequired: boolean("credentials_required").notNull().default(false),
  updateFrequency: text("update_frequency").notNull(),
  termsUrl: text("terms_url"),
  termsCheckedAt: date("terms_checked_at"),
  termsSummary: text("terms_summary").notNull(),
  attribution: text("attribution").notNull(),
  permissions: jsonb("permissions").$type<SourcePermissions>().notNull(),
  status: text("status", { enum: ["ativo", "restrito", "pendente", "desativado"] }).notNull(),
  pendingReview: text("pending_review"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const ingestionRuns = pgTable("ingestion_runs", {
  id: serial("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => sources.id),
  job: text("job").notNull(),
  params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status", { enum: ["running", "success", "partial", "failed"] }).notNull(),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  itemsSeen: integer("items_seen").notNull().default(0),
  itemsCreated: integer("items_created").notNull().default(0),
  itemsUpdated: integer("items_updated").notNull().default(0),
  itemsUnchanged: integer("items_unchanged").notNull().default(0),
  requests: integer("requests").notNull().default(0),
  error: text("error"),
}, (t) => [index("ingestion_runs_job_idx").on(t.job, t.startedAt)]);

export const jobCheckpoints = pgTable("job_checkpoints", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ───────────────────────── Temas (taxonomia do produto) ─────────────────────────

export const topics = pgTable("topics", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  /** Peso público usado no panorama (documentado em /metodologia). */
  publicRelevanceWeight: real("public_relevance_weight").notNull().default(1),
  /** Categorias de RSS da Agência Brasil mapeadas para este tema. */
  newsCategories: text("news_categories").array().notNull().default(sql`'{}'::text[]`),
  /** Códigos de tema da Câmara (referencias/proposicoes/codTema). */
  camaraThemeCodes: integer("camara_theme_codes").array().notNull().default(sql`'{}'::int[]`),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ───────────────────────── Notícias ─────────────────────────

export const eventClusters = pgTable("event_clusters", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  firstSeenAt: ts("first_seen_at").notNull(),
  lastSeenAt: ts("last_seen_at").notNull(),
  size: integer("size").notNull().default(1),
  sourceCount: integer("source_count").notNull().default(1),
});

export const newsArticles = pgTable("news_articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: text("source_id").notNull().references(() => sources.id),
  externalId: text("external_id").notNull(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  /** Trecho inicial fornecido pela fonte (sanitizado, sem HTML), limitado conforme permissões. */
  lead: text("lead").notNull(),
  /** Quantidade de caracteres de texto disponível no feed (para sinalizar conteúdo limitado). */
  feedTextLength: integer("feed_text_length").notNull().default(0),
  topicSlug: text("topic_slug").references(() => topics.slug),
  sourceCategory: text("source_category"),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  author: text("author"),
  imageUrl: text("image_url"),
  publishedAt: ts("published_at").notNull(),
  collectedAt: ts("collected_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  contentHash: text("content_hash").notNull(),
  version: integer("version").notNull().default(1),
  clusterId: integer("cluster_id").references(() => eventClusters.id),
  searchVector: tsvector("search_vector").generatedAlwaysAs(
    sql`setweight(to_tsvector('portuguese', immutable_unaccent(coalesce(title, ''))), 'A') || setweight(to_tsvector('portuguese', immutable_unaccent(coalesce(lead, ''))), 'B') || setweight(to_tsvector('portuguese', immutable_unaccent(immutable_array_to_text(tags))), 'C')`,
  ),
}, (t) => [
  uniqueIndex("news_source_external_uq").on(t.sourceId, t.externalId),
  index("news_published_idx").on(t.publishedAt),
  index("news_topic_idx").on(t.topicSlug, t.publishedAt),
  index("news_cluster_idx").on(t.clusterId),
  index("news_search_idx").using("gin", t.searchVector),
]);

export const newsArticleVersions = pgTable("news_article_versions", {
  articleId: uuid("article_id").notNull().references(() => newsArticles.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  contentHash: text("content_hash").notNull(),
  title: text("title").notNull(),
  lead: text("lead").notNull(),
  collectedAt: ts("collected_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.articleId, t.version] })]);

// ───────────────────────── Pessoas políticas ─────────────────────────

export const persons = pgTable("persons", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  civilName: text("civil_name"),
  photoUrl: text("photo_url"),
  photoSource: text("photo_source"),
  /** Último partido/UF informados pela fonte, com a data a que se referem. Nunca aplicar a eventos antigos. */
  lastKnownParty: text("last_known_party"),
  lastKnownUf: text("last_known_uf"),
  lastKnownStatusAt: ts("last_known_status_at"),
  lastKnownSituation: text("last_known_situation"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  detailSyncedAt: ts("detail_synced_at"),
  propositionsSyncedAt: ts("propositions_synced_at"),
}, (t) => [index("persons_name_trgm_idx").using("gin", sql`immutable_unaccent(lower(${t.name})) gin_trgm_ops`)]);

/** Identificadores oficiais. Nunca unir pessoas por semelhança de nome. */
export const personExternalIds = pgTable("person_external_ids", {
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  system: text("system", { enum: ["camara", "senado", "tse"] }).notNull(),
  externalId: text("external_id").notNull(),
  method: text("method", { enum: ["id_oficial", "tabela_verificada", "cpf_oficial"] }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.system, t.externalId] }),
  index("person_ext_person_idx").on(t.personId),
]);

export const mandates = pgTable("mandates", {
  id: serial("id").primaryKey(),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  office: text("office", { enum: ["deputado_federal", "senador"] }).notNull(),
  uf: text("uf").notNull(),
  legislature: integer("legislature").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  sourceId: text("source_id").notNull().references(() => sources.id),
}, (t) => [uniqueIndex("mandates_uq").on(t.personId, t.office, t.legislature)]);

/** Eventos de status registrados pela fonte (partido, situação, condição) com data. */
export const personStatusEvents = pgTable("person_status_events", {
  id: serial("id").primaryKey(),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull().references(() => sources.id),
  at: ts("at").notNull(),
  legislature: integer("legislature"),
  party: text("party"),
  uf: text("uf"),
  situation: text("situation"),
  condition: text("condition"),
  description: text("description"),
}, (t) => [
  uniqueIndex("person_status_uq").on(t.personId, t.at, t.legislature, sql`coalesce(${t.party}, '')`, sql`coalesce(${t.description}, '')`),
  index("person_status_person_idx").on(t.personId, t.at),
]);

/** Interesse registrado por cargos ainda sem conector (sem simular dados). */
export const coverageInterest = pgTable("coverage_interest", {
  id: serial("id").primaryKey(),
  office: text("office").notNull(),
  uf: text("uf"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// ───────────────────────── Proposições ─────────────────────────

export const propositions = pgTable("propositions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: text("source_id").notNull().references(() => sources.id),
  externalId: text("external_id").notNull(),
  siglaTipo: text("sigla_tipo").notNull(),
  numero: integer("numero").notNull(),
  ano: integer("ano").notNull(),
  descricaoTipo: text("descricao_tipo"),
  ementa: text("ementa").notNull(),
  ementaDetalhada: text("ementa_detalhada"),
  keywords: text("keywords"),
  presentedAt: ts("presented_at"),
  urlInteiroTeor: text("url_inteiro_teor"),
  statusAt: ts("status_at"),
  statusSituacao: text("status_situacao"),
  statusCodSituacao: text("status_cod_situacao"),
  statusTramitacao: text("status_tramitacao"),
  statusOrgao: text("status_orgao"),
  statusDespacho: text("status_despacho"),
  regime: text("regime"),
  apreciacao: text("apreciacao"),
  /** ID externo do último relator registrado em ultimoStatus (pode ser nulo). */
  lastRapporteurExternalId: text("last_rapporteur_external_id"),
  mainPropositionExternalId: text("main_proposition_external_id"),
  contentHash: text("content_hash").notNull(),
  version: integer("version").notNull().default(1),
  collectedAt: ts("collected_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  detailSyncedAt: ts("detail_synced_at"),
  searchVector: tsvector("search_vector").generatedAlwaysAs(
    sql`setweight(to_tsvector('portuguese', immutable_unaccent(sigla_tipo || ' ' || numero::text || ' ' || ano::text)), 'A') || setweight(to_tsvector('portuguese', immutable_unaccent(coalesce(ementa, ''))), 'A') || setweight(to_tsvector('portuguese', immutable_unaccent(coalesce(ementa_detalhada, ''))), 'B') || setweight(to_tsvector('portuguese', immutable_unaccent(coalesce(keywords, ''))), 'C')`,
  ),
}, (t) => [
  uniqueIndex("propositions_source_external_uq").on(t.sourceId, t.externalId),
  index("propositions_tipo_num_idx").on(t.siglaTipo, t.numero, t.ano),
  index("propositions_rapporteur_idx").on(t.lastRapporteurExternalId),
  index("propositions_presented_idx").on(t.presentedAt),
  index("propositions_search_idx").using("gin", t.searchVector),
]);

export const propositionVersions = pgTable("proposition_versions", {
  propositionId: uuid("proposition_id").notNull().references(() => propositions.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  contentHash: text("content_hash").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  collectedAt: ts("collected_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.propositionId, t.version] })]);

/** Texto oficial extraído (atos oficiais não são objeto de direito autoral — Lei 9.610/98, art. 8º, IV). */
export const propositionTexts = pgTable("proposition_texts", {
  id: serial("id").primaryKey(),
  propositionId: uuid("proposition_id").notNull().references(() => propositions.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  contentHash: text("content_hash"),
  text: text("text"),
  pageCount: integer("page_count"),
  status: text("status", { enum: ["ok", "falha", "sem_texto", "muito_grande"] }).notNull(),
  error: text("error"),
  extractedAt: ts("extracted_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("proposition_texts_uq").on(t.propositionId, t.url)]);

export const propositionAuthors = pgTable("proposition_authors", {
  id: serial("id").primaryKey(),
  propositionId: uuid("proposition_id").notNull().references(() => propositions.id, { onDelete: "cascade" }),
  /** Preenchido só quando a fonte traz ID oficial do parlamentar. */
  personId: uuid("person_id").references(() => persons.id, { onDelete: "set null" }),
  authorKey: text("author_key").notNull(),
  name: text("name").notNull(),
  authorType: text("author_type"),
  /** Campo "proponente" da Câmara: true para todos os autores (ver signatureOrder); false = apoiamento. Ver src/domain/authorship.ts. */
  proponent: boolean("proponent"),
  signatureOrder: integer("signature_order"),
  partyAtTime: text("party_at_time"),
  ufAtTime: text("uf_at_time"),
  origin: text("origin", { enum: ["arquivo_anual", "api"] }).notNull(),
}, (t) => [
  uniqueIndex("proposition_authors_uq").on(t.propositionId, t.authorKey),
  index("proposition_authors_person_idx").on(t.personId),
]);

export const propositionThemes = pgTable("proposition_themes", {
  propositionId: uuid("proposition_id").notNull().references(() => propositions.id, { onDelete: "cascade" }),
  codTema: integer("cod_tema").notNull(),
  tema: text("tema").notNull(),
  relevancia: integer("relevancia"),
}, (t) => [primaryKey({ columns: [t.propositionId, t.codTema] }), index("proposition_themes_cod_idx").on(t.codTema)]);

export const tramitacoes = pgTable("tramitacoes", {
  propositionId: uuid("proposition_id").notNull().references(() => propositions.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  at: ts("at").notNull(),
  orgao: text("orgao"),
  descricaoTramitacao: text("descricao_tramitacao"),
  codTipoTramitacao: text("cod_tipo_tramitacao"),
  situacao: text("situacao"),
  codSituacao: text("cod_situacao"),
  despacho: text("despacho"),
  url: text("url"),
  regime: text("regime"),
  apreciacao: text("apreciacao"),
  /** Etapa derivada por regra determinística (src/domain/legislative-stage.ts). */
  stage: text("stage").notNull(),
}, (t) => [primaryKey({ columns: [t.propositionId, t.sequence] }), index("tramitacoes_at_idx").on(t.at)]);

// ───────────────────────── Acompanhamento e salvos ─────────────────────────

export const follows = pgTable("follows", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetType: text("target_type", { enum: ["person", "topic", "proposition"] }).notNull(),
  targetId: text("target_id").notNull(),
  frequency: text("frequency", { enum: ["diaria", "semanal"] }).notNull().default("diaria"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("follows_uq").on(t.userId, t.targetType, t.targetId)]);

export const savedItems = pgTable("saved_items", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemType: text("item_type", { enum: ["news", "proposition"] }).notNull(),
  itemId: text("item_id").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("saved_uq").on(t.userId, t.itemType, t.itemId)]);

// ───────────────────────── Conversas e respostas geradas ─────────────────────────

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Só pessoas logadas têm histórico persistido. */
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contextType: text("context_type", { enum: ["news", "proposition", "person", "geral"] }).notNull(),
  contextId: text("context_id"),
  createdAt: createdAt(),
}, (t) => [index("conversations_user_idx").on(t.userId, t.createdAt)]);

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: jsonb("content").$type<unknown>().notNull(),
  createdAt: createdAt(),
}, (t) => [index("messages_conv_idx").on(t.conversationId, t.id)]);

/**
 * Explicações/respostas públicas cacheadas por (assunto, versão da fonte, nível, tipo, versão do prompt).
 * Nunca contém dados pessoais: conversas privadas não são cacheadas aqui.
 */
export const generatedAnswers = pgTable("generated_answers", {
  id: serial("id").primaryKey(),
  cacheKey: text("cache_key").notNull(),
  kind: text("kind").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  subjectVersionHash: text("subject_version_hash").notNull(),
  level: text("level").notNull(),
  promptVersion: text("prompt_version").notNull(),
  model: text("model").notNull(),
  status: text("status", { enum: ["ok", "abstencao", "rejeitada"] }).notNull(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  validation: jsonb("validation").$type<unknown>().notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("generated_answers_cache_uq").on(t.cacheKey), index("generated_answers_subject_idx").on(t.subjectType, t.subjectId)]);

export const aiUsage = pgTable("ai_usage", {
  id: serial("id").primaryKey(),
  at: ts("at").notNull().defaultNow(),
  route: text("route").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  estimatedCostUsd: real("estimated_cost_usd").notNull().default(0),
  outcome: text("outcome").notNull(),
}, (t) => [index("ai_usage_at_idx").on(t.at)]);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").notNull(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.key, t.windowStart] })]);

export const adminAuditLog = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  at: ts("at").notNull().defaultNow(),
});

// ───────────────────────── Dados financeiros ─────────────────────────

/**
 * Cota para o Exercício da Atividade Parlamentar (CEAP), agregada por mês e categoria.
 * Fonte: arquivos anuais da Câmara (www.camara.leg.br/cotas/Ano-AAAA.csv.zip), vinculados pelo ideCadastro (ID oficial).
 * Valores em reais: vlrLiquido (o que foi efetivamente reembolsado, já descontadas glosas).
 */
export const ceapMonthly = pgTable("ceap_monthly", {
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  category: text("category").notNull(),
  netValue: real("net_value").notNull(),
  documents: integer("documents").notNull(),
}, (t) => [primaryKey({ columns: [t.personId, t.year, t.month, t.category] })]);

/** Fornecedores por ano. CPF de pessoa física nunca é armazenado (só CNPJ). */
export const ceapSuppliers = pgTable("ceap_suppliers", {
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  supplierKey: text("supplier_key").notNull(),
  supplierName: text("supplier_name").notNull(),
  cnpj: text("cnpj"),
  category: text("category").notNull(),
  netValue: real("net_value").notNull(),
  documents: integer("documents").notNull(),
}, (t) => [primaryKey({ columns: [t.personId, t.year, t.supplierKey, t.category] }), index("ceap_suppliers_person_year_idx").on(t.personId, t.year)]);

/** Bens declarados ao TSE no registro de candidatura. Vínculo pelo CPF oficial (usado só durante a carga, não armazenado). */
export const declaredAssets = pgTable("declared_assets", {
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  electionYear: integer("election_year").notNull(),
  candidateId: text("candidate_id").notNull(),
  order: integer("order").notNull(),
  assetType: text("asset_type").notNull(),
  description: text("description"),
  value: real("value").notNull(),
}, (t) => [primaryKey({ columns: [t.personId, t.electionYear, t.order] })]);
