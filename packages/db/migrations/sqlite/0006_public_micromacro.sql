CREATE TABLE `competitor_seller_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `competitor_sellers` (
	`id` text PRIMARY KEY NOT NULL,
	`marketplace_code` text NOT NULL,
	`seller_ref` text NOT NULL,
	`seller_name` text NOT NULL,
	`group_id` text,
	`operator_note` text,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `competitor_seller_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competitor_sellers_marketplace_ref` ON `competitor_sellers` (`marketplace_code`,`seller_ref`);--> statement-breakpoint
CREATE INDEX `competitor_sellers_group` ON `competitor_sellers` (`group_id`);