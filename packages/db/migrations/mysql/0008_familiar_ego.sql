CREATE TABLE `brands` (
	`id` varchar(36) NOT NULL,
	`marketplace_code` varchar(20) NOT NULL,
	`ref` varchar(64) NOT NULL,
	`name` text NOT NULL,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `brands_id` PRIMARY KEY(`id`),
	CONSTRAINT `brands_marketplace_ref` UNIQUE(`marketplace_code`,`ref`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` varchar(36) NOT NULL,
	`marketplace_code` varchar(20) NOT NULL,
	`ref` varchar(64) NOT NULL,
	`name` text NOT NULL,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_marketplace_ref` UNIQUE(`marketplace_code`,`ref`)
);
--> statement-breakpoint
CREATE TABLE `tracked_product_observations` (
	`id` varchar(36) NOT NULL,
	`tracked_product_id` varchar(36) NOT NULL,
	`observed_at` bigint NOT NULL,
	`status` text NOT NULL,
	`rank` int,
	`seller_name` text,
	`seller_ref` text,
	`price` bigint,
	`final_price` bigint,
	`offered_stock` int,
	CONSTRAINT `tracked_product_observations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tracked_products` (
	`id` varchar(36) NOT NULL,
	`marketplace_code` varchar(20) NOT NULL,
	`product_ref` varchar(128) NOT NULL,
	`product_url` text NOT NULL,
	`label` text NOT NULL,
	`is_active` boolean NOT NULL,
	`added_at` bigint NOT NULL,
	CONSTRAINT `tracked_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `tracked_products_marketplace_ref` UNIQUE(`marketplace_code`,`product_ref`)
);
--> statement-breakpoint
ALTER TABLE `listings` ADD `brand_id` varchar(36);--> statement-breakpoint
ALTER TABLE `listings` ADD `category_id` varchar(36);--> statement-breakpoint
ALTER TABLE `brands` ADD CONSTRAINT `brands_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tracked_product_observations` ADD CONSTRAINT `fk_tpo_tracked_product_id` FOREIGN KEY (`tracked_product_id`) REFERENCES `tracked_products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD CONSTRAINT `tracked_products_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `tracked_product_observations_product_observed` ON `tracked_product_observations` (`tracked_product_id`,`observed_at`);--> statement-breakpoint
ALTER TABLE `listings` ADD CONSTRAINT `listings_brand_id_brands_id_fk` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listings` ADD CONSTRAINT `listings_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `listings_brand_id` ON `listings` (`brand_id`);--> statement-breakpoint
CREATE INDEX `listings_category_id` ON `listings` (`category_id`);