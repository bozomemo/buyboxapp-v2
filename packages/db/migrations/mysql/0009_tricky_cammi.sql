CREATE TABLE `watched_brand_groups` (
	`id` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `watched_brand_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watched_brands` (
	`id` varchar(36) NOT NULL,
	`group_id` varchar(36) NOT NULL,
	`marketplace_code` varchar(20) NOT NULL,
	`label` varchar(190) NOT NULL,
	`brand_ref` varchar(128),
	`search_term` text,
	`is_active` boolean NOT NULL,
	`last_swept_at` bigint,
	`last_sweep_product_count` int,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `watched_brands_id` PRIMARY KEY(`id`),
	CONSTRAINT `watched_brands_group_marketplace_label` UNIQUE(`group_id`,`marketplace_code`,`label`)
);
--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `watched_brand_id` varchar(36);--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `via_brand_ref` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `via_search_term` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `brand_name` text;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `category_ref` varchar(64);--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `category_name` text;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `rating_count` int;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `rating_average` real;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `last_swept_at` bigint;--> statement-breakpoint
ALTER TABLE `watched_brands` ADD CONSTRAINT `watched_brands_group_id_watched_brand_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `watched_brand_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `watched_brands` ADD CONSTRAINT `watched_brands_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `watched_brands_group` ON `watched_brands` (`group_id`);--> statement-breakpoint
ALTER TABLE `tracked_products` ADD CONSTRAINT `fk_tracked_products_watched_brand_id` FOREIGN KEY (`watched_brand_id`) REFERENCES `watched_brands`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `tracked_products_watched_brand` ON `tracked_products` (`watched_brand_id`);