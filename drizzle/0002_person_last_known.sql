ALTER TABLE "persons" ADD COLUMN "last_known_party" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "last_known_uf" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "last_known_status_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "last_known_situation" text;