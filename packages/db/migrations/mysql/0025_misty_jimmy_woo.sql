CREATE TABLE `commission_tariffs` (
	`id` varchar(36) NOT NULL,
	`marketplace_code` varchar(20) NOT NULL,
	`product_key` varchar(64) NOT NULL,
	`barcode` varchar(64),
	`seller_stock_code` varchar(128),
	`valid_from` bigint NOT NULL,
	`valid_until` bigint NOT NULL,
	`tiers_json` text NOT NULL,
	`source_file` text NOT NULL,
	`imported_at` bigint NOT NULL,
	CONSTRAINT `commission_tariffs_id` PRIMARY KEY(`id`),
	CONSTRAINT `commission_tariffs_product_period` UNIQUE(`marketplace_code`,`product_key`,`valid_from`)
);
--> statement-breakpoint
ALTER TABLE `brand_products` ADD `unit_price` bigint;--> statement-breakpoint
ALTER TABLE `brand_products` ADD `desi` real;--> statement-breakpoint
ALTER TABLE `commission_tariffs` ADD CONSTRAINT `fk_commission_tariffs_marketplace_code` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `commission_tariffs_valid_until` ON `commission_tariffs` (`valid_until`);