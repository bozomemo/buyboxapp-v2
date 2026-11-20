ALTER TABLE `band_violations` ADD `basis` text DEFAULT 'shelf' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `queue_dismissed_at` integer;