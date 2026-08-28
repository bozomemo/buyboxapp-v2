CREATE TABLE "tracked_product_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"tracked_product_id" text NOT NULL,
	"observed_at" bigint NOT NULL,
	"rating_count" integer,
	"rating_average" real
);
--> statement-breakpoint
ALTER TABLE "tracked_product_metrics" ADD CONSTRAINT "tracked_product_metrics_tracked_product_id_tracked_products_id_fk" FOREIGN KEY ("tracked_product_id") REFERENCES "public"."tracked_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracked_product_metrics_product_observed" ON "tracked_product_metrics" USING btree ("tracked_product_id","observed_at");