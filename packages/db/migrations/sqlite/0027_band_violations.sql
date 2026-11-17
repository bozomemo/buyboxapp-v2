CREATE TABLE `band_violations` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_product_id` text NOT NULL,
	`tracked_product_id` text NOT NULL,
	`kind` text NOT NULL,
	`seller_ref` text,
	`seller_name` text NOT NULL,
	`state` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`resolved_at` integer,
	`resolution` text,
	`threshold_applied` text NOT NULL,
	`unit_multiplier` integer NOT NULL,
	`observed_price` text NOT NULL,
	`price_source` text NOT NULL,
	`snapshot` text NOT NULL,
	FOREIGN KEY (`brand_product_id`) REFERENCES `brand_products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tracked_product_id`) REFERENCES `tracked_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `band_violations_state_first_seen` ON `band_violations` (`state`,`first_seen_at`);--> statement-breakpoint
CREATE INDEX `band_violations_card_kind_state` ON `band_violations` (`tracked_product_id`,`kind`,`state`);--> statement-breakpoint
CREATE INDEX `band_violations_product_state` ON `band_violations` (`brand_product_id`,`state`);