CREATE TABLE `competitor_seller_groups` (
	`id` varchar(36) NOT NULL,
	`display_name` text NOT NULL,
	`note` text,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `competitor_seller_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `competitor_sellers` (
	`id` varchar(36) NOT NULL,
	`marketplace_code` varchar(20) NOT NULL,
	`seller_ref` varchar(64) NOT NULL,
	`seller_name` text NOT NULL,
	`group_id` varchar(36),
	`operator_note` text,
	`first_seen_at` bigint NOT NULL,
	`last_seen_at` bigint NOT NULL,
	CONSTRAINT `competitor_sellers_id` PRIMARY KEY(`id`),
	CONSTRAINT `competitor_sellers_marketplace_ref` UNIQUE(`marketplace_code`,`seller_ref`)
);
--> statement-breakpoint
ALTER TABLE `competitor_sellers` ADD CONSTRAINT `competitor_sellers_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `competitor_sellers` ADD CONSTRAINT `competitor_sellers_group_id_competitor_seller_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `competitor_seller_groups`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `competitor_sellers_group` ON `competitor_sellers` (`group_id`);