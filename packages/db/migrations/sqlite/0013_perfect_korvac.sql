CREATE TABLE `seller_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`watched_brand_group_id` text NOT NULL,
	`watched_brand_id` text,
	`marketplace_code` text,
	`seller_ref` text,
	`tax_number` text,
	`status` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`watched_brand_group_id`) REFERENCES `watched_brand_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`watched_brand_id`) REFERENCES `watched_brands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `seller_policies_scope` ON `seller_policies` (`watched_brand_group_id`,`watched_brand_id`);--> statement-breakpoint
CREATE INDEX `seller_policies_seller` ON `seller_policies` (`marketplace_code`,`seller_ref`);--> statement-breakpoint
CREATE INDEX `seller_policies_tax` ON `seller_policies` (`tax_number`);--> statement-breakpoint
ALTER TABLE `competitor_sellers` ADD `tax_number` text;