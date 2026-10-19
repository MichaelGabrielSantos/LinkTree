CREATE TABLE "ceap_monthly" (
	"person_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"category" text NOT NULL,
	"net_value" real NOT NULL,
	"documents" integer NOT NULL,
	CONSTRAINT "ceap_monthly_person_id_year_month_category_pk" PRIMARY KEY("person_id","year","month","category")
);
--> statement-breakpoint
CREATE TABLE "ceap_suppliers" (
	"person_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"supplier_key" text NOT NULL,
	"supplier_name" text NOT NULL,
	"cnpj" text,
	"category" text NOT NULL,
	"net_value" real NOT NULL,
	"documents" integer NOT NULL,
	CONSTRAINT "ceap_suppliers_person_id_year_supplier_key_category_pk" PRIMARY KEY("person_id","year","supplier_key","category")
);
--> statement-breakpoint
CREATE TABLE "declared_assets" (
	"person_id" uuid NOT NULL,
	"election_year" integer NOT NULL,
	"candidate_id" text NOT NULL,
	"order" integer NOT NULL,
	"asset_type" text NOT NULL,
	"description" text,
	"value" real NOT NULL,
	CONSTRAINT "declared_assets_person_id_election_year_order_pk" PRIMARY KEY("person_id","election_year","order")
);
--> statement-breakpoint
ALTER TABLE "ceap_monthly" ADD CONSTRAINT "ceap_monthly_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceap_suppliers" ADD CONSTRAINT "ceap_suppliers_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declared_assets" ADD CONSTRAINT "declared_assets_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ceap_suppliers_person_year_idx" ON "ceap_suppliers" USING btree ("person_id","year");