CREATE TABLE `tracked_product_sellers` (
	`tracked_product_id` varchar(36) NOT NULL,
	`seller_ref` varchar(64) NOT NULL,
	`first_seen_at` bigint NOT NULL,
	`last_seen_at` bigint NOT NULL,
	CONSTRAINT `tracked_product_sellers_tracked_product_id_seller_ref_pk` PRIMARY KEY(`tracked_product_id`,`seller_ref`)
);
--> statement-breakpoint
ALTER TABLE `tracked_product_sellers` ADD CONSTRAINT `fk_tps_tracked_product_id` FOREIGN KEY (`tracked_product_id`) REFERENCES `tracked_products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `tracked_product_sellers_seller_seen` ON `tracked_product_sellers` (`seller_ref`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `tracked_product_sellers_product_seen` ON `tracked_product_sellers` (`tracked_product_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `tracked_products_rating_count` ON `tracked_products` (`rating_count`);--> statement-breakpoint
-- 2026-11-08 seller filters spec §4.4: one-time backfill of tracked_product_sellers from the
-- change-only archive. A seller whose offer set has not changed since before the 30-day window
-- gets an old last_seen_at here; the next successful look of the card corrects it (accepted gap).
-- seller_ref is varchar(64) here (InnoDB key); a longer ref could not be a key and is skipped.
INSERT INTO `tracked_product_sellers` (`tracked_product_id`, `seller_ref`, `first_seen_at`, `last_seen_at`)
SELECT `tracked_product_id`, `seller_ref`, min(`observed_at`), max(`observed_at`)
FROM `tracked_product_observations` WHERE `status` = 'ok' AND `seller_ref` IS NOT NULL AND char_length(`seller_ref`) <= 64
GROUP BY `tracked_product_id`, `seller_ref`;
