CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"marketplace_code" text NOT NULL,
	"ref" text NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"marketplace_code" text NOT NULL,
	"ref" text NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_product_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"tracked_product_id" text NOT NULL,
	"observed_at" bigint NOT NULL,
	"status" text NOT NULL,
	"rank" integer,
	"seller_name" text,
	"seller_ref" text,
	"price" bigint,
	"final_price" bigint,
	"offered_stock" integer
);
--> statement-breakpoint
CREATE TABLE "tracked_products" (
	"id" text PRIMARY KEY NOT NULL,
	"marketplace_code" text NOT NULL,
	"product_ref" text NOT NULL,
	"product_url" text NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean NOT NULL,
	"added_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "brand_id" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "category_id" text;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_product_observations" ADD CONSTRAINT "tracked_product_observations_tracked_product_id_tracked_products_id_fk" FOREIGN KEY ("tracked_product_id") REFERENCES "public"."tracked_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD CONSTRAINT "tracked_products_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brands_marketplace_ref" ON "brands" USING btree ("marketplace_code","ref");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_marketplace_ref" ON "categories" USING btree ("marketplace_code","ref");--> statement-breakpoint
CREATE INDEX "tracked_product_observations_product_observed" ON "tracked_product_observations" USING btree ("tracked_product_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_products_marketplace_ref" ON "tracked_products" USING btree ("marketplace_code","product_ref");--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listings_brand_id" ON "listings" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "listings_category_id" ON "listings" USING btree ("category_id");