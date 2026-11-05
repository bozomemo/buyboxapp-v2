CREATE TABLE "commission_tariffs" (
	"id" text PRIMARY KEY NOT NULL,
	"marketplace_code" text NOT NULL,
	"product_key" text NOT NULL,
	"barcode" text,
	"seller_stock_code" text,
	"valid_from" bigint NOT NULL,
	"valid_until" bigint NOT NULL,
	"tiers_json" text NOT NULL,
	"source_file" text NOT NULL,
	"imported_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_products" ADD COLUMN "unit_price" bigint;--> statement-breakpoint
ALTER TABLE "brand_products" ADD COLUMN "desi" real;--> statement-breakpoint
ALTER TABLE "commission_tariffs" ADD CONSTRAINT "commission_tariffs_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_tariffs_product_period" ON "commission_tariffs" USING btree ("marketplace_code","product_key","valid_from");--> statement-breakpoint
CREATE INDEX "commission_tariffs_valid_until" ON "commission_tariffs" USING btree ("valid_until");