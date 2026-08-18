CREATE TABLE `alert_rules` (
	`id` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`scope_type` varchar(20) NOT NULL,
	`scope_value` text,
	`subject_type` varchar(20) NOT NULL,
	`subject_value` text,
	`predicate` varchar(20) NOT NULL,
	`threshold_type` varchar(20) NOT NULL,
	`threshold_value` bigint,
	`threshold_pct` int,
	`quiet_period_ms` int NOT NULL,
	`enabled` boolean NOT NULL,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `alert_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alert_sellers` (
	`id` varchar(36) NOT NULL,
	`alert_id` varchar(36) NOT NULL,
	`seller_ref` varchar(64),
	`seller_name` text NOT NULL,
	`observed_price` bigint,
	`price_source` varchar(16) NOT NULL,
	`rank` int NOT NULL,
	`promotion_text` text,
	`joined_at` bigint NOT NULL,
	`left_at` bigint,
	CONSTRAINT `alert_sellers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` varchar(36) NOT NULL,
	`rule_id` varchar(36) NOT NULL,
	`alert_key` varchar(200) NOT NULL,
	`listing_id` varchar(36) NOT NULL,
	`seller_ref` varchar(64),
	`state` varchar(16) NOT NULL,
	`first_seen_at` bigint NOT NULL,
	`last_seen_at` bigint NOT NULL,
	`resolved_at` bigint,
	`threshold_applied` bigint,
	`snapshot` text,
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `alert_sellers` ADD CONSTRAINT `alert_sellers_alert_id_alerts_id_fk` FOREIGN KEY (`alert_id`) REFERENCES `alerts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_rule_id_alert_rules_id_fk` FOREIGN KEY (`rule_id`) REFERENCES `alert_rules`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_listing_id_listings_id_fk` FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `alert_sellers_alert` ON `alert_sellers` (`alert_id`);--> statement-breakpoint
CREATE INDEX `alerts_key_state` ON `alerts` (`alert_key`,`state`);--> statement-breakpoint
CREATE INDEX `alerts_state_last_seen` ON `alerts` (`state`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `alerts_listing` ON `alerts` (`listing_id`);