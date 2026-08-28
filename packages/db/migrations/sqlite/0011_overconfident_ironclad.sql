CREATE TABLE `tracked_product_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`tracked_product_id` text NOT NULL,
	`observed_at` integer NOT NULL,
	`rating_count` integer,
	`rating_average` real,
	FOREIGN KEY (`tracked_product_id`) REFERENCES `tracked_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tracked_product_metrics_product_observed` ON `tracked_product_metrics` (`tracked_product_id`,`observed_at`);