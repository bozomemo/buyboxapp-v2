ALTER TABLE `tracked_products` ADD `barcode` varchar(32);--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `barcode_resolved_at` bigint;--> statement-breakpoint
CREATE INDEX `tracked_products_barcode` ON `tracked_products` (`barcode`);