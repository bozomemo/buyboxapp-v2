ALTER TABLE "tracked_products" ADD COLUMN "last_offers_hash" text;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "last_scraped_at" bigint;