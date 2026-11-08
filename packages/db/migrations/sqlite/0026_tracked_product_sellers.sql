CREATE TABLE `tracked_product_sellers` (
	`tracked_product_id` text NOT NULL,
	`seller_ref` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	PRIMARY KEY(`tracked_product_id`, `seller_ref`),
	FOREIGN KEY (`tracked_product_id`) REFERENCES `tracked_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tracked_product_sellers_seller_seen` ON `tracked_product_sellers` (`seller_ref`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `tracked_product_sellers_product_seen` ON `tracked_product_sellers` (`tracked_product_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `tracked_products_rating_count` ON `tracked_products` (`rating_count`);--> statement-breakpoint
-- 2026-11-08 seller filters spec §4.4: one-time backfill of tracked_product_sellers from the
-- change-only archive. A seller whose offer set has not changed since before the 30-day window
-- gets an old last_seen_at here; the next successful look of the card corrects it (accepted gap).
INSERT INTO `tracked_product_sellers` (`tracked_product_id`, `seller_ref`, `first_seen_at`, `last_seen_at`)
SELECT `tracked_product_id`, `seller_ref`, min(`observed_at`), max(`observed_at`)
FROM `tracked_product_observations` WHERE `status` = 'ok' AND `seller_ref` IS NOT NULL
GROUP BY `tracked_product_id`, `seller_ref`;
