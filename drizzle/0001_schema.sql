CREATE TABLE "admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"route" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" real DEFAULT 0 NOT NULL,
	"outcome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"granted" boolean NOT NULL,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"context_type" text NOT NULL,
	"context_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_interest" (
	"id" serial PRIMARY KEY NOT NULL,
	"office" text NOT NULL,
	"uf" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_clusters" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"size" integer DEFAULT 1 NOT NULL,
	"source_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"frequency" text DEFAULT 'diaria' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"cache_key" text NOT NULL,
	"kind" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"subject_version_hash" text NOT NULL,
	"level" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb NOT NULL,
	"validation" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"job" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"items_seen" integer DEFAULT 0 NOT NULL,
	"items_created" integer DEFAULT 0 NOT NULL,
	"items_updated" integer DEFAULT 0 NOT NULL,
	"items_unchanged" integer DEFAULT 0 NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "job_checkpoints" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mandates" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"office" text NOT NULL,
	"uf" text NOT NULL,
	"legislature" integer NOT NULL,
	"start_date" date,
	"end_date" date,
	"source_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_article_versions" (
	"article_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"title" text NOT NULL,
	"lead" text NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_article_versions_article_id_version_pk" PRIMARY KEY("article_id","version")
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"lead" text NOT NULL,
	"feed_text_length" integer DEFAULT 0 NOT NULL,
	"topic_slug" text,
	"source_category" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"author" text,
	"image_url" text,
	"published_at" timestamp with time zone NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"cluster_id" integer,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('portuguese', immutable_unaccent(coalesce(title, ''))), 'A') || setweight(to_tsvector('portuguese', immutable_unaccent(coalesce(lead, ''))), 'B') || setweight(to_tsvector('portuguese', immutable_unaccent(immutable_array_to_text(tags))), 'C')) STORED
);
--> statement-breakpoint
CREATE TABLE "person_external_ids" (
	"person_id" uuid NOT NULL,
	"system" text NOT NULL,
	"external_id" text NOT NULL,
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_external_ids_system_external_id_pk" PRIMARY KEY("system","external_id")
);
--> statement-breakpoint
CREATE TABLE "person_status_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"legislature" integer,
	"party" text,
	"uf" text,
	"situation" text,
	"condition" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"civil_name" text,
	"photo_url" text,
	"photo_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail_synced_at" timestamp with time zone,
	"propositions_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "proposition_authors" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposition_id" uuid NOT NULL,
	"person_id" uuid,
	"author_key" text NOT NULL,
	"name" text NOT NULL,
	"author_type" text,
	"proponent" boolean,
	"signature_order" integer,
	"party_at_time" text,
	"uf_at_time" text,
	"origin" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposition_texts" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposition_id" uuid NOT NULL,
	"url" text NOT NULL,
	"content_hash" text,
	"text" text,
	"page_count" integer,
	"status" text NOT NULL,
	"error" text,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposition_themes" (
	"proposition_id" uuid NOT NULL,
	"cod_tema" integer NOT NULL,
	"tema" text NOT NULL,
	"relevancia" integer,
	CONSTRAINT "proposition_themes_proposition_id_cod_tema_pk" PRIMARY KEY("proposition_id","cod_tema")
);
--> statement-breakpoint
CREATE TABLE "proposition_versions" (
	"proposition_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposition_versions_proposition_id_version_pk" PRIMARY KEY("proposition_id","version")
);
--> statement-breakpoint
CREATE TABLE "propositions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"sigla_tipo" text NOT NULL,
	"numero" integer NOT NULL,
	"ano" integer NOT NULL,
	"descricao_tipo" text,
	"ementa" text NOT NULL,
	"ementa_detalhada" text,
	"keywords" text,
	"presented_at" timestamp with time zone,
	"url_inteiro_teor" text,
	"status_at" timestamp with time zone,
	"status_situacao" text,
	"status_cod_situacao" text,
	"status_tramitacao" text,
	"status_orgao" text,
	"status_despacho" text,
	"regime" text,
	"apreciacao" text,
	"last_rapporteur_external_id" text,
	"main_proposition_external_id" text,
	"content_hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail_synced_at" timestamp with time zone,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('portuguese', immutable_unaccent(sigla_tipo || ' ' || numero::text || ' ' || ano::text)), 'A') || setweight(to_tsvector('portuguese', immutable_unaccent(coalesce(ementa, ''))), 'A') || setweight(to_tsvector('portuguese', immutable_unaccent(coalesce(ementa_detalhada, ''))), 'B') || setweight(to_tsvector('portuguese', immutable_unaccent(coalesce(keywords, ''))), 'C')) STORED
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "saved_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"coverage" text NOT NULL,
	"access_method" text NOT NULL,
	"credentials_required" boolean DEFAULT false NOT NULL,
	"update_frequency" text NOT NULL,
	"terms_url" text,
	"terms_checked_at" date,
	"terms_summary" text NOT NULL,
	"attribution" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"status" text NOT NULL,
	"pending_review" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"public_relevance_weight" real DEFAULT 1 NOT NULL,
	"news_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"camara_theme_codes" integer[] DEFAULT '{}'::int[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramitacoes" (
	"proposition_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"orgao" text,
	"descricao_tramitacao" text,
	"cod_tipo_tramitacao" text,
	"situacao" text,
	"cod_situacao" text,
	"despacho" text,
	"url" text,
	"regime" text,
	"apreciacao" text,
	"stage" text NOT NULL,
	CONSTRAINT "tramitacoes_proposition_id_sequence_pk" PRIMARY KEY("proposition_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_interest" ADD CONSTRAINT "coverage_interest_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_article_versions" ADD CONSTRAINT "news_article_versions_article_id_news_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."news_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_topic_slug_topics_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topics"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_cluster_id_event_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."event_clusters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_external_ids" ADD CONSTRAINT "person_external_ids_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_status_events" ADD CONSTRAINT "person_status_events_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_status_events" ADD CONSTRAINT "person_status_events_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposition_authors" ADD CONSTRAINT "proposition_authors_proposition_id_propositions_id_fk" FOREIGN KEY ("proposition_id") REFERENCES "public"."propositions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposition_authors" ADD CONSTRAINT "proposition_authors_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposition_texts" ADD CONSTRAINT "proposition_texts_proposition_id_propositions_id_fk" FOREIGN KEY ("proposition_id") REFERENCES "public"."propositions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposition_themes" ADD CONSTRAINT "proposition_themes_proposition_id_propositions_id_fk" FOREIGN KEY ("proposition_id") REFERENCES "public"."propositions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposition_versions" ADD CONSTRAINT "proposition_versions_proposition_id_propositions_id_fk" FOREIGN KEY ("proposition_id") REFERENCES "public"."propositions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propositions" ADD CONSTRAINT "propositions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramitacoes" ADD CONSTRAINT "tramitacoes_proposition_id_propositions_id_fk" FOREIGN KEY ("proposition_id") REFERENCES "public"."propositions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_at_idx" ON "ai_usage" USING btree ("at");--> statement-breakpoint
CREATE INDEX "consents_user_kind_idx" ON "consents" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "conversations_user_idx" ON "conversations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "follows_uq" ON "follows" USING btree ("user_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_answers_cache_uq" ON "generated_answers" USING btree ("cache_key");--> statement-breakpoint
CREATE INDEX "generated_answers_subject_idx" ON "generated_answers" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "ingestion_runs_job_idx" ON "ingestion_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mandates_uq" ON "mandates" USING btree ("person_id","office","legislature");--> statement-breakpoint
CREATE INDEX "messages_conv_idx" ON "messages" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "news_source_external_uq" ON "news_articles" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "news_published_idx" ON "news_articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "news_topic_idx" ON "news_articles" USING btree ("topic_slug","published_at");--> statement-breakpoint
CREATE INDEX "news_cluster_idx" ON "news_articles" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "news_search_idx" ON "news_articles" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "person_ext_person_idx" ON "person_external_ids" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_status_uq" ON "person_status_events" USING btree ("person_id","at","legislature",coalesce("party", ''),coalesce("description", ''));--> statement-breakpoint
CREATE INDEX "person_status_person_idx" ON "person_status_events" USING btree ("person_id","at");--> statement-breakpoint
CREATE INDEX "persons_name_trgm_idx" ON "persons" USING gin (immutable_unaccent(lower("name")) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "proposition_authors_uq" ON "proposition_authors" USING btree ("proposition_id","author_key");--> statement-breakpoint
CREATE INDEX "proposition_authors_person_idx" ON "proposition_authors" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposition_texts_uq" ON "proposition_texts" USING btree ("proposition_id","url");--> statement-breakpoint
CREATE INDEX "proposition_themes_cod_idx" ON "proposition_themes" USING btree ("cod_tema");--> statement-breakpoint
CREATE UNIQUE INDEX "propositions_source_external_uq" ON "propositions" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "propositions_tipo_num_idx" ON "propositions" USING btree ("sigla_tipo","numero","ano");--> statement-breakpoint
CREATE INDEX "propositions_rapporteur_idx" ON "propositions" USING btree ("last_rapporteur_external_id");--> statement-breakpoint
CREATE INDEX "propositions_presented_idx" ON "propositions" USING btree ("presented_at");--> statement-breakpoint
CREATE INDEX "propositions_search_idx" ON "propositions" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_uq" ON "saved_items" USING btree ("user_id","item_type","item_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tramitacoes_at_idx" ON "tramitacoes" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));