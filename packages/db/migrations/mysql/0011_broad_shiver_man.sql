CREATE TABLE `tracked_product_metrics` (
	`id` varchar(36) NOT NULL,
	`tracked_product_id` varchar(36) NOT NULL,
	`observed_at` bigint NOT NULL,
	`rating_count` int,
	`rating_average` real,
	CONSTRAINT `tracked_product_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tracked_product_metrics` ADD CONSTRAINT `fk_tpm_tracked_product_id` FOREIGN KEY (`tracked_product_id`) REFERENCES `tracked_products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `tracked_product_metrics_product_observed` ON `tracked_product_metrics` (`tracked_product_id`,`observed_at`);