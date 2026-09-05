ALTER TABLE "tracked_products" ADD COLUMN "has_sellers" boolean;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "last_seller_seen_at" bigint;