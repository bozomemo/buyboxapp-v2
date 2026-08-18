CREATE TABLE "competitor_seller_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"note" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_sellers" (
	"id" text PRIMARY KEY NOT NULL,
	"marketplace_code" text NOT NULL,
	"seller_ref" text NOT NULL,
	"seller_name" text NOT NULL,
	"group_id" text,
	"operator_note" text,
	"first_seen_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitor_sellers" ADD CONSTRAINT "competitor_sellers_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_sellers" ADD CONSTRAINT "competitor_sellers_group_id_competitor_seller_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."competitor_seller_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_sellers_marketplace_ref" ON "competitor_sellers" USING btree ("marketplace_code","seller_ref");--> statement-breakpoint
CREATE INDEX "competitor_sellers_group" ON "competitor_sellers" USING btree ("group_id");