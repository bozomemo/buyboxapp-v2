CREATE TABLE `watched_brand_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watched_brands` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`marketplace_code` text NOT NULL,
	`label` text NOT NULL,
	`brand_ref` text,
	`search_term` text,
	`is_active` integer NOT NULL,
	`last_swept_at` integer,
	`last_sweep_product_count` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `watched_brand_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `watched_brands_group` ON `watched_brands` (`group_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `watched_brands_group_marketplace_label` ON `watched_brands` (`group_id`,`marketplace_code`,`label`);--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `watched_brand_id` text REFERENCES watched_brands(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `via_brand_ref` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `via_search_term` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `brand_name` text;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `category_ref` text;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `category_name` text;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `rating_count` integer;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `rating_average` real;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `last_swept_at` integer;--> statement-breakpoint
CREATE INDEX `tracked_products_watched_brand` ON `tracked_products` (`watched_brand_id`);