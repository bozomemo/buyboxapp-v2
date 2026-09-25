CREATE TABLE `brand_product_cards` (
	`id` varchar(36) NOT NULL,
	`brand_product_id` varchar(36) NOT NULL,
	`tracked_product_id` varchar(36) NOT NULL,
	`marketplace_code` varchar(20) NOT NULL,
	`unit_multiplier` int NOT NULL,
	`is_primary` boolean NOT NULL,
	`link_source` varchar(20) NOT NULL,
	`linked_at` bigint NOT NULL,
	CONSTRAINT `brand_product_cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `brand_product_cards_tracked_product` UNIQUE(`tracked_product_id`)
);
--> statement-breakpoint
CREATE TABLE `brand_products` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`reference_price` bigint NOT NULL,
	`min_price` bigint,
	`max_price` bigint,
	`barcode` varchar(32),
	`source` varchar(20) NOT NULL,
	`reference_price_source` text,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `brand_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `is_favourite` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `favourited_at` bigint;--> statement-breakpoint
ALTER TABLE `brand_product_cards` ADD CONSTRAINT `fk_brand_product_cards_product_id` FOREIGN KEY (`brand_product_id`) REFERENCES `brand_products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `brand_product_cards` ADD CONSTRAINT `fk_brand_product_cards_tracked_product_id` FOREIGN KEY (`tracked_product_id`) REFERENCES `tracked_products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `brand_product_cards_product` ON `brand_product_cards` (`brand_product_id`);--> statement-breakpoint
CREATE INDEX `brand_products_barcode` ON `brand_products` (`barcode`);--> statement-breakpoint
CREATE INDEX `brand_products_name` ON `brand_products` (`name`);--> statement-breakpoint
-- doc 17 §2.5: see the sqlite migration of the same number. `name` is varchar(255) here.
INSERT INTO `brand_products` (`id`, `name`, `reference_price`, `min_price`, `max_price`, `barcode`, `source`, `reference_price_source`, `created_at`, `updated_at`)
SELECT `id`, left(`label`, 255), `reference_price`, NULL, NULL, NULL, 'migration', `reference_price_source`, coalesce(`reference_price_updated_at`, `added_at`), coalesce(`reference_price_updated_at`, `added_at`)
FROM `tracked_products` WHERE `reference_price` IS NOT NULL;--> statement-breakpoint
INSERT INTO `brand_product_cards` (`id`, `brand_product_id`, `tracked_product_id`, `marketplace_code`, `unit_multiplier`, `is_primary`, `link_source`, `linked_at`)
SELECT `id`, `id`, `id`, `marketplace_code`, 1, true, 'migration', coalesce(`reference_price_updated_at`, `added_at`)
FROM `tracked_products` WHERE `reference_price` IS NOT NULL;
