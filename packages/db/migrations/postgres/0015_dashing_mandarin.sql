ALTER TABLE "tracked_products" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "barcode_resolved_at" bigint;--> statement-breakpoint
CREATE INDEX "tracked_products_barcode" ON "tracked_products" USING btree ("barcode");