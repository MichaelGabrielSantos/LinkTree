CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- unaccent() não é IMMUTABLE; este wrapper permite usá-lo em colunas geradas e índices.
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION immutable_array_to_text(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT coalesce(array_to_string($1, ' '), '') $$;
