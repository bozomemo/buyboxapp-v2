ALTER TABLE "tracked_product_observations" ADD COLUMN "seller_rating" real;--> statement-breakpoint
ALTER TABLE "tracked_product_observations" ADD COLUMN "dispatch_time" integer;--> statement-breakpoint
ALTER TABLE "tracked_product_observations" ADD COLUMN "has_promotion" boolean;--> statement-breakpoint
ALTER TABLE "tracked_product_observations" ADD COLUMN "promotion_text" text;--> statement-breakpoint
ALTER TABLE "tracked_product_observations" ADD COLUMN "listing_ref" text;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "reference_price" bigint;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "reference_price_source" text;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "reference_price_updated_at" bigint;