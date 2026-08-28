CREATE TABLE `seller_policies` (
	`id` varchar(36) NOT NULL,
	`watched_brand_group_id` varchar(36) NOT NULL,
	`watched_brand_id` varchar(36),
	`marketplace_code` varchar(20),
	`seller_ref` varchar(128),
	`tax_number` varchar(32),
	`status` varchar(16) NOT NULL,
	`note` text,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `seller_policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `competitor_sellers` ADD `tax_number` varchar(32);--> statement-breakpoint
ALTER TABLE `seller_policies` ADD CONSTRAINT `seller_policies_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seller_policies` ADD CONSTRAINT `fk_seller_policies_watched_brand_group_id` FOREIGN KEY (`watched_brand_group_id`) REFERENCES `watched_brand_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seller_policies` ADD CONSTRAINT `fk_seller_policies_watched_brand_id` FOREIGN KEY (`watched_brand_id`) REFERENCES `watched_brands`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `seller_policies_scope` ON `seller_policies` (`watched_brand_group_id`,`watched_brand_id`);--> statement-breakpoint
CREATE INDEX `seller_policies_seller` ON `seller_policies` (`marketplace_code`,`seller_ref`);--> statement-breakpoint
CREATE INDEX `seller_policies_tax` ON `seller_policies` (`tax_number`);