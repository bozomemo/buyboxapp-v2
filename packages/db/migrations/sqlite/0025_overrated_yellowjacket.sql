CREATE TABLE `commission_tariffs` (
	`id` text PRIMARY KEY NOT NULL,
	`marketplace_code` text NOT NULL,
	`product_key` text NOT NULL,
	`barcode` text,
	`seller_stock_code` text,
	`valid_from` integer NOT NULL,
	`valid_until` integer NOT NULL,
	`tiers_json` text NOT NULL,
	`source_file` text NOT NULL,
	`imported_at` integer NOT NULL,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commission_tariffs_product_period` ON `commission_tariffs` (`marketplace_code`,`product_key`,`valid_from`);--> statement-breakpoint
CREATE INDEX `commission_tariffs_valid_until` ON `commission_tariffs` (`valid_until`);--> statement-breakpoint
ALTER TABLE `brand_products` ADD `unit_price` text;--> statement-breakpoint
ALTER TABLE `brand_products` ADD `desi` real;