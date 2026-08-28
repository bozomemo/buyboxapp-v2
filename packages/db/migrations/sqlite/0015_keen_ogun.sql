ALTER TABLE `tracked_products` ADD `barcode` text;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `barcode_resolved_at` integer;--> statement-breakpoint
CREATE INDEX `tracked_products_barcode` ON `tracked_products` (`barcode`);