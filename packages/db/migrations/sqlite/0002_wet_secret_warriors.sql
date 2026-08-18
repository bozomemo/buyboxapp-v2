PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`marketplace_code` text NOT NULL,
	`marketplace_listing_id` text NOT NULL,
	`seller_stock_code` text NOT NULL,
	`base_stock_code` text,
	`unit_count` integer NOT NULL,
	`is_bundle` integer NOT NULL,
	`product_name` text NOT NULL,
	`price` text NOT NULL,
	`list_price` text,
	`customer_price` text,
	`offered_stock` integer NOT NULL,
	`commission_rate` real,
	`vat_rate` integer,
	`dispatch_time` integer,
	`is_salable` integer NOT NULL,
	`is_locked` integer NOT NULL,
	`is_suspended` integer NOT NULL,
	`is_frozen` integer NOT NULL,
	`is_archived` integer NOT NULL,
	`is_blacklisted` integer NOT NULL,
	`lock_reasons` text,
	`deactivation_reasons` text,
	`min_price` text,
	`max_price` text,
	`allow_increase` integer NOT NULL,
	`allow_decrease` integer NOT NULL,
	`reprice_enabled` integer NOT NULL,
	`extra` text,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_listings`("id", "marketplace_code", "marketplace_listing_id", "seller_stock_code", "base_stock_code", "unit_count", "is_bundle", "product_name", "price", "list_price", "customer_price", "offered_stock", "commission_rate", "vat_rate", "dispatch_time", "is_salable", "is_locked", "is_suspended", "is_frozen", "is_archived", "is_blacklisted", "lock_reasons", "deactivation_reasons", "min_price", "max_price", "allow_increase", "allow_decrease", "reprice_enabled", "extra", "first_seen_at", "last_seen_at", "updated_at") SELECT "id", "marketplace_code", "marketplace_listing_id", "seller_stock_code", "base_stock_code", "unit_count", "is_bundle", "product_name", "price", "list_price", "customer_price", "offered_stock", "commission_rate", "vat_rate", "dispatch_time", "is_salable", "is_locked", "is_suspended", "is_frozen", "is_archived", "is_blacklisted", "lock_reasons", "deactivation_reasons", "min_price", "max_price", "allow_increase", "allow_decrease", "reprice_enabled", "extra", "first_seen_at", "last_seen_at", "updated_at" FROM `listings`;--> statement-breakpoint
DROP TABLE `listings`;--> statement-breakpoint
ALTER TABLE `__new_listings` RENAME TO `listings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `listings_marketplace_listing_id` ON `listings` (`marketplace_code`,`marketplace_listing_id`);--> statement-breakpoint
CREATE INDEX `listings_base_stock_code` ON `listings` (`base_stock_code`);--> statement-breakpoint
CREATE INDEX `listings_marketplace_salable_reprice` ON `listings` (`marketplace_code`,`is_salable`,`reprice_enabled`);--> statement-breakpoint
CREATE INDEX `listings_seller_stock_code` ON `listings` (`seller_stock_code`);