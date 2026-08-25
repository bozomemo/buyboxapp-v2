CREATE TABLE `brands` (
	`id` text PRIMARY KEY NOT NULL,
	`marketplace_code` text NOT NULL,
	`ref` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brands_marketplace_ref` ON `brands` (`marketplace_code`,`ref`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`marketplace_code` text NOT NULL,
	`ref` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_marketplace_ref` ON `categories` (`marketplace_code`,`ref`);--> statement-breakpoint
CREATE TABLE `tracked_product_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`tracked_product_id` text NOT NULL,
	`observed_at` integer NOT NULL,
	`status` text NOT NULL,
	`rank` integer,
	`seller_name` text,
	`seller_ref` text,
	`price` text,
	`final_price` text,
	`offered_stock` integer,
	FOREIGN KEY (`tracked_product_id`) REFERENCES `tracked_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tracked_product_observations_product_observed` ON `tracked_product_observations` (`tracked_product_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `tracked_products` (
	`id` text PRIMARY KEY NOT NULL,
	`marketplace_code` text NOT NULL,
	`product_ref` text NOT NULL,
	`product_url` text NOT NULL,
	`label` text NOT NULL,
	`is_active` integer NOT NULL,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_products_marketplace_ref` ON `tracked_products` (`marketplace_code`,`product_ref`);--> statement-breakpoint
ALTER TABLE `listings` ADD `brand_id` text REFERENCES brands(id);--> statement-breakpoint
ALTER TABLE `listings` ADD `category_id` text REFERENCES categories(id);--> statement-breakpoint
CREATE INDEX `listings_brand_id` ON `listings` (`brand_id`);--> statement-breakpoint
CREATE INDEX `listings_category_id` ON `listings` (`category_id`);