CREATE TABLE "watched_brand_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watched_brands" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"marketplace_code" text NOT NULL,
	"label" text NOT NULL,
	"brand_ref" text,
	"search_term" text,
	"is_active" boolean NOT NULL,
	"last_swept_at" bigint,
	"last_sweep_product_count" integer,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "watched_brand_id" text;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "via_brand_ref" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "via_search_term" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "brand_name" text;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "category_ref" text;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "category_name" text;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "rating_count" integer;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "rating_average" real;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "last_swept_at" bigint;--> statement-breakpoint
ALTER TABLE "watched_brands" ADD CONSTRAINT "watched_brands_group_id_watched_brand_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."watched_brand_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watched_brands" ADD CONSTRAINT "watched_brands_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watched_brands_group" ON "watched_brands" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watched_brands_group_marketplace_label" ON "watched_brands" USING btree ("group_id","marketplace_code","label");--> statement-breakpoint
ALTER TABLE "tracked_products" ADD CONSTRAINT "tracked_products_watched_brand_id_watched_brands_id_fk" FOREIGN KEY ("watched_brand_id") REFERENCES "public"."watched_brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracked_products_watched_brand" ON "tracked_products" USING btree ("watched_brand_id");