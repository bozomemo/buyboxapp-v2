CREATE TABLE "seller_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"watched_brand_group_id" text NOT NULL,
	"watched_brand_id" text,
	"marketplace_code" text,
	"seller_ref" text,
	"tax_number" text,
	"status" text NOT NULL,
	"note" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitor_sellers" ADD COLUMN "tax_number" text;--> statement-breakpoint
ALTER TABLE "seller_policies" ADD CONSTRAINT "seller_policies_watched_brand_group_id_watched_brand_groups_id_fk" FOREIGN KEY ("watched_brand_group_id") REFERENCES "public"."watched_brand_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_policies" ADD CONSTRAINT "seller_policies_watched_brand_id_watched_brands_id_fk" FOREIGN KEY ("watched_brand_id") REFERENCES "public"."watched_brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_policies" ADD CONSTRAINT "seller_policies_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seller_policies_scope" ON "seller_policies" USING btree ("watched_brand_group_id","watched_brand_id");--> statement-breakpoint
CREATE INDEX "seller_policies_seller" ON "seller_policies" USING btree ("marketplace_code","seller_ref");--> statement-breakpoint
CREATE INDEX "seller_policies_tax" ON "seller_policies" USING btree ("tax_number");