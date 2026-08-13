CREATE TABLE `app_events` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`level` text NOT NULL,
	`marketplace_code` text,
	`listing_id` text,
	`job_run_id` text,
	`code` text NOT NULL,
	`message` text NOT NULL,
	`context` text,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_run_id`) REFERENCES `job_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `app_events_at` ON `app_events` (`at`);--> statement-breakpoint
CREATE INDEX `app_events_level_at` ON `app_events` (`level`,`at`);--> statement-breakpoint
CREATE INDEX `app_events_listing_at` ON `app_events` (`listing_id`,`at`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bundle_members` (
	`bundle_stock_code` text NOT NULL,
	`member_stock_code` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`bundle_stock_code`, `member_stock_code`),
	FOREIGN KEY (`bundle_stock_code`) REFERENCES `bundles`(`bundle_stock_code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bundles` (
	`bundle_stock_code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `buybox_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`observed_at` integer NOT NULL,
	`rank` integer,
	`buybox_price` text,
	`second_price` text,
	`third_price` text,
	`has_multiple_seller` integer NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `buybox_observations_listing_observed` ON `buybox_observations` (`listing_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `competitor_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`scrape_run_id` text NOT NULL,
	`observed_at` integer NOT NULL,
	`rank` integer NOT NULL,
	`seller_name` text NOT NULL,
	`seller_ref` text,
	`price` text,
	`final_price` text,
	`rating` real,
	`dispatch_time` integer,
	`offered_stock` integer,
	`has_promotion` integer NOT NULL,
	`promotion_text` text,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scrape_run_id`) REFERENCES `scrape_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competitor_observations_listing_observed` ON `competitor_observations` (`listing_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `competitor_observations_seller_observed` ON `competitor_observations` (`seller_ref`,`observed_at`);--> statement-breakpoint
CREATE TABLE `fee_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`marketplace_code` text NOT NULL,
	`effective_from` integer NOT NULL,
	`commission_vat_rate` integer NOT NULL,
	`commission_rate_includes_vat` integer NOT NULL,
	`commission_vat_deductible` integer NOT NULL,
	`commission_base` text NOT NULL,
	`default_commission_rate` real NOT NULL,
	`cargo_bands` text NOT NULL,
	`cargo_amounts_include_vat` integer NOT NULL,
	`cargo_vat_rate` integer NOT NULL,
	`cargo_vat_deductible` integer NOT NULL,
	`expenditure_bands` text NOT NULL,
	`expenditure_includes_vat` integer NOT NULL,
	`expenditure_vat_rate` integer NOT NULL,
	`expenditure_vat_deductible` integer NOT NULL,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fee_settings_marketplace_effective_from` ON `fee_settings` (`marketplace_code`,`effective_from`);--> statement-breakpoint
CREATE TABLE `job_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`job_name` text NOT NULL,
	`payload` text NOT NULL,
	`priority` integer NOT NULL,
	`state` text NOT NULL,
	`run_after` integer NOT NULL,
	`locked_by` text,
	`locked_until` integer,
	`attempts` integer NOT NULL,
	`max_attempts` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `job_queue_claim` ON `job_queue` (`state`,`priority`,`run_after`);--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_name` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`state` text NOT NULL,
	`items_total` integer NOT NULL,
	`items_ok` integer NOT NULL,
	`items_failed` integer NOT NULL,
	`error` text,
	`correlation_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `listing_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`final_price` text NOT NULL,
	`store_share_pct` real NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`observed_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `listing_campaigns_listing_id` ON `listing_campaigns` (`listing_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`marketplace_code` text NOT NULL,
	`marketplace_listing_id` text NOT NULL,
	`seller_stock_code` text NOT NULL,
	`base_stock_code` text,
	`unit_count` integer NOT NULL,
	`is_bundle` integer NOT NULL,
	`product_name` text NOT NULL,
	`price` text NOT NULL,
	`list_price` text,
	`customer_price` text,
	`offered_stock` integer NOT NULL,
	`commission_rate` real,
	`vat_rate` integer,
	`dispatch_time` integer,
	`is_salable` integer NOT NULL,
	`is_locked` integer NOT NULL,
	`is_suspended` integer NOT NULL,
	`is_frozen` integer NOT NULL,
	`is_archived` integer NOT NULL,
	`is_blacklisted` integer NOT NULL,
	`lock_reasons` text,
	`deactivation_reasons` text,
	`min_price` text,
	`max_price` text,
	`allow_increase` integer NOT NULL,
	`allow_decrease` integer NOT NULL,
	`reprice_enabled` integer NOT NULL,
	`extra` text,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_stock_code`) REFERENCES `stock_items`(`base_stock_code`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listings_marketplace_listing_id` ON `listings` (`marketplace_code`,`marketplace_listing_id`);--> statement-breakpoint
CREATE INDEX `listings_base_stock_code` ON `listings` (`base_stock_code`);--> statement-breakpoint
CREATE INDEX `listings_marketplace_salable_reprice` ON `listings` (`marketplace_code`,`is_salable`,`reprice_enabled`);--> statement-breakpoint
CREATE INDEX `listings_seller_stock_code` ON `listings` (`seller_stock_code`);--> statement-breakpoint
CREATE TABLE `marketplaces` (
	`code` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`enabled` integer NOT NULL,
	`merchant_ref` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`marketplace_code` text NOT NULL,
	`old_price` text NOT NULL,
	`new_price` text NOT NULL,
	`reason` text NOT NULL,
	`explanation` text NOT NULL,
	`priority` integer NOT NULL,
	`decided_at` integer NOT NULL,
	`state` text NOT NULL,
	`submitted_at` integer,
	`confirmed_at` integer,
	`marketplace_handle` text,
	`failure_code` text,
	`failure_message` text,
	`attempts` integer NOT NULL,
	`unit_cost` text,
	`floor_price` text,
	`buybox_price` text,
	`second_price` text,
	`rank` integer,
	`commission_rate` real,
	`vat_rate` integer,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `price_submissions_listing_decided` ON `price_submissions` (`listing_id`,`decided_at`);--> statement-breakpoint
CREATE INDEX `price_submissions_outbox` ON `price_submissions` (`state`,`priority`,`decided_at`);--> statement-breakpoint
CREATE INDEX `price_submissions_budget` ON `price_submissions` (`marketplace_code`,`confirmed_at`);--> statement-breakpoint
CREATE TABLE `repricing_policies` (
	`marketplace_code` text PRIMARY KEY NOT NULL,
	`coarse_step_mode` text NOT NULL,
	`coarse_step_absolute` text,
	`coarse_step_percent` real,
	`refine_tolerance` text NOT NULL,
	`seek_strategy` text NOT NULL,
	`undercut_by` text NOT NULL,
	`seek_step` text NOT NULL,
	`sole_seller_margin_pct` real NOT NULL,
	`low_stock_guard_enabled` integer NOT NULL,
	`low_stock_threshold` integer NOT NULL,
	`low_stock_margin_pct` real NOT NULL,
	`stock_mode` text NOT NULL,
	`min_physical_stock` integer NOT NULL,
	`require_price_confirmation` integer NOT NULL,
	`settle_duration_ms` integer NOT NULL,
	`competitor_price_delta` text NOT NULL,
	`use_seller_identity_trigger` integer NOT NULL,
	`poll_interval_ms` integer NOT NULL,
	`concurrency` integer NOT NULL,
	`daily_update_allowance_formula` text NOT NULL,
	`budget_reserve_pct` real NOT NULL,
	`enabled` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `repricing_state` (
	`listing_id` text PRIMARY KEY NOT NULL,
	`phase` text NOT NULL,
	`last_good_price` text,
	`last_bad_price` text,
	`optimum_price` text,
	`optimum_ctx_unit_cost` text,
	`optimum_ctx_commission_rate` real,
	`optimum_ctx_vat_rate` integer,
	`optimum_ctx_campaign_ratio` real,
	`optimum_ctx_second_price` text,
	`optimum_ctx_second_seller_ref` text,
	`pending_submission_id` text,
	`settle_until` integer,
	`consecutive_rejections` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pending_submission_id`) REFERENCES `price_submissions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `scrape_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`observed_at` integer NOT NULL,
	`source` text NOT NULL,
	`seller_count` integer NOT NULL,
	`payload_hash` text NOT NULL,
	`status` text NOT NULL,
	`changed` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scrape_runs_listing_observed` ON `scrape_runs` (`listing_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `settings_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`changed_by` text NOT NULL,
	`changed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `settings_audit_entity` ON `settings_audit` (`entity`,`entity_id`,`changed_at`);--> statement-breakpoint
CREATE TABLE `stock_items` (
	`base_stock_code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`unit_cost` text NOT NULL,
	`unit_stock` integer NOT NULL,
	`source_code` text NOT NULL,
	`source_ref` text,
	`cost_updated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_marketplace_prefs` (
	`base_stock_code` text NOT NULL,
	`marketplace_code` text NOT NULL,
	`price_multiplier` real NOT NULL,
	`auto_reprice_enabled` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`base_stock_code`, `marketplace_code`),
	FOREIGN KEY (`base_stock_code`) REFERENCES `stock_items`(`base_stock_code`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `update_budget_usage` (
	`marketplace_code` text NOT NULL,
	`usage_date` text NOT NULL,
	`consumed` integer NOT NULL,
	`allowance` integer NOT NULL,
	PRIMARY KEY(`marketplace_code`, `usage_date`),
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
