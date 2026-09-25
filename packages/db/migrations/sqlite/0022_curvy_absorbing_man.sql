CREATE TABLE `brand_product_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_product_id` text NOT NULL,
	`tracked_product_id` text NOT NULL,
	`marketplace_code` text NOT NULL,
	`unit_multiplier` integer NOT NULL,
	`is_primary` integer NOT NULL,
	`link_source` text NOT NULL,
	`linked_at` integer NOT NULL,
	FOREIGN KEY (`brand_product_id`) REFERENCES `brand_products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tracked_product_id`) REFERENCES `tracked_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `brand_product_cards_product` ON `brand_product_cards` (`brand_product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `brand_product_cards_tracked_product` ON `brand_product_cards` (`tracked_product_id`);--> statement-breakpoint
CREATE TABLE `brand_products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`reference_price` text NOT NULL,
	`min_price` text,
	`max_price` text,
	`barcode` text,
	`source` text NOT NULL,
	`reference_price_source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `brand_products_barcode` ON `brand_products` (`barcode`);--> statement-breakpoint
CREATE INDEX `brand_products_name` ON `brand_products` (`name`);--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `is_favourite` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `favourited_at` integer;--> statement-breakpoint
-- doc 17 §2.5: PSF moves from the card to a brand product. Each priced card becomes a brand product
-- of its own, reusing the card's id (distinct tables, so no collision), and is linked to it as the
-- ×1 primary. Money is copied as stored, so no value passes through a float.
INSERT INTO `brand_products` (`id`, `name`, `reference_price`, `min_price`, `max_price`, `barcode`, `source`, `reference_price_source`, `created_at`, `updated_at`)
SELECT `id`, `label`, `reference_price`, NULL, NULL, NULL, 'migration', `reference_price_source`, coalesce(`reference_price_updated_at`, `added_at`), coalesce(`reference_price_updated_at`, `added_at`)
FROM `tracked_products` WHERE `reference_price` IS NOT NULL;--> statement-breakpoint
INSERT INTO `brand_product_cards` (`id`, `brand_product_id`, `tracked_product_id`, `marketplace_code`, `unit_multiplier`, `is_primary`, `link_source`, `linked_at`)
SELECT `id`, `id`, `id`, `marketplace_code`, 1, 1, 'migration', coalesce(`reference_price_updated_at`, `added_at`)
FROM `tracked_products` WHERE `reference_price` IS NOT NULL;
