CREATE TABLE "brand_product_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_product_id" text NOT NULL,
	"tracked_product_id" text NOT NULL,
	"marketplace_code" text NOT NULL,
	"unit_multiplier" integer NOT NULL,
	"is_primary" boolean NOT NULL,
	"link_source" text NOT NULL,
	"linked_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"reference_price" bigint NOT NULL,
	"min_price" bigint,
	"max_price" bigint,
	"barcode" text,
	"source" text NOT NULL,
	"reference_price_source" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "is_favourite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "favourited_at" bigint;--> statement-breakpoint
ALTER TABLE "brand_product_cards" ADD CONSTRAINT "brand_product_cards_brand_product_id_brand_products_id_fk" FOREIGN KEY ("brand_product_id") REFERENCES "public"."brand_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_product_cards" ADD CONSTRAINT "brand_product_cards_tracked_product_id_tracked_products_id_fk" FOREIGN KEY ("tracked_product_id") REFERENCES "public"."tracked_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_product_cards_product" ON "brand_product_cards" USING btree ("brand_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_product_cards_tracked_product" ON "brand_product_cards" USING btree ("tracked_product_id");--> statement-breakpoint
CREATE INDEX "brand_products_barcode" ON "brand_products" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "brand_products_name" ON "brand_products" USING btree ("name");--> statement-breakpoint
-- doc 17 §2.5: see the sqlite migration of the same number.
INSERT INTO "brand_products" ("id", "name", "reference_price", "min_price", "max_price", "barcode", "source", "reference_price_source", "created_at", "updated_at")
SELECT "id", "label", "reference_price", NULL, NULL, NULL, 'migration', "reference_price_source", coalesce("reference_price_updated_at", "added_at"), coalesce("reference_price_updated_at", "added_at")
FROM "tracked_products" WHERE "reference_price" IS NOT NULL;--> statement-breakpoint
INSERT INTO "brand_product_cards" ("id", "brand_product_id", "tracked_product_id", "marketplace_code", "unit_multiplier", "is_primary", "link_source", "linked_at")
SELECT "id", "id", "id", "marketplace_code", 1, true, 'migration', coalesce("reference_price_updated_at", "added_at")
FROM "tracked_products" WHERE "reference_price" IS NOT NULL;
