CREATE TABLE `band_violations` (
	`id` varchar(36) NOT NULL,
	`brand_product_id` varchar(36) NOT NULL,
	`tracked_product_id` varchar(36) NOT NULL,
	`kind` varchar(20) NOT NULL,
	`seller_ref` varchar(128),
	`seller_name` text NOT NULL,
	`state` varchar(20) NOT NULL,
	`first_seen_at` bigint NOT NULL,
	`last_seen_at` bigint NOT NULL,
	`resolved_at` bigint,
	`resolution` varchar(32),
	`threshold_applied` bigint NOT NULL,
	`unit_multiplier` int NOT NULL,
	`observed_price` bigint NOT NULL,
	`price_source` varchar(20) NOT NULL,
	`snapshot` text NOT NULL,
	CONSTRAINT `band_violations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `band_violations` ADD CONSTRAINT `fk_band_violations_brand_product_id` FOREIGN KEY (`brand_product_id`) REFERENCES `brand_products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `band_violations` ADD CONSTRAINT `fk_band_violations_tracked_product_id` FOREIGN KEY (`tracked_product_id`) REFERENCES `tracked_products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `band_violations_state_first_seen` ON `band_violations` (`state`,`first_seen_at`);--> statement-breakpoint
CREATE INDEX `band_violations_card_kind_state` ON `band_violations` (`tracked_product_id`,`kind`,`state`);--> statement-breakpoint
CREATE INDEX `band_violations_product_state` ON `band_violations` (`brand_product_id`,`state`);