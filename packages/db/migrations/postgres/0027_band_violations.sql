CREATE TABLE "band_violations" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_product_id" text NOT NULL,
	"tracked_product_id" text NOT NULL,
	"kind" text NOT NULL,
	"seller_ref" text,
	"seller_name" text NOT NULL,
	"state" text NOT NULL,
	"first_seen_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL,
	"resolved_at" bigint,
	"resolution" text,
	"threshold_applied" bigint NOT NULL,
	"unit_multiplier" integer NOT NULL,
	"observed_price" bigint NOT NULL,
	"price_source" text NOT NULL,
	"snapshot" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "band_violations" ADD CONSTRAINT "band_violations_brand_product_id_brand_products_id_fk" FOREIGN KEY ("brand_product_id") REFERENCES "public"."brand_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "band_violations" ADD CONSTRAINT "band_violations_tracked_product_id_tracked_products_id_fk" FOREIGN KEY ("tracked_product_id") REFERENCES "public"."tracked_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "band_violations_state_first_seen" ON "band_violations" USING btree ("state","first_seen_at");--> statement-breakpoint
CREATE INDEX "band_violations_card_kind_state" ON "band_violations" USING btree ("tracked_product_id","kind","state");--> statement-breakpoint
CREATE INDEX "band_violations_product_state" ON "band_violations" USING btree ("brand_product_id","state");