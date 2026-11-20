ALTER TABLE `band_violations` ADD `basis` varchar(16) DEFAULT 'shelf' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `queue_dismissed_at` bigint;