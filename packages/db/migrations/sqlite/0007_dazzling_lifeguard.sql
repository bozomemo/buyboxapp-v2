CREATE TABLE `alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_value` text,
	`subject_type` text NOT NULL,
	`subject_value` text,
	`predicate` text NOT NULL,
	`threshold_type` text NOT NULL,
	`threshold_value` text,
	`threshold_pct` integer,
	`quiet_period_ms` integer NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alert_sellers` (
	`id` text PRIMARY KEY NOT NULL,
	`alert_id` text NOT NULL,
	`seller_ref` text,
	`seller_name` text NOT NULL,
	`observed_price` text,
	`price_source` text NOT NULL,
	`rank` integer NOT NULL,
	`promotion_text` text,
	`joined_at` integer NOT NULL,
	`left_at` integer,
	FOREIGN KEY (`alert_id`) REFERENCES `alerts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alert_sellers_alert` ON `alert_sellers` (`alert_id`);--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`alert_key` text NOT NULL,
	`listing_id` text NOT NULL,
	`seller_ref` text,
	`state` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`resolved_at` integer,
	`threshold_applied` text,
	`snapshot` text,
	FOREIGN KEY (`rule_id`) REFERENCES `alert_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alerts_key_state` ON `alerts` (`alert_key`,`state`);--> statement-breakpoint
CREATE INDEX `alerts_state_last_seen` ON `alerts` (`state`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `alerts_listing` ON `alerts` (`listing_id`);