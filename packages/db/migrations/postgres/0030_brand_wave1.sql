ALTER TABLE "band_violations" ADD COLUMN "basis" text DEFAULT 'shelf' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "queue_dismissed_at" bigint;