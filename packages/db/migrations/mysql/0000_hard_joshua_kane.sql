CREATE TABLE `app_events` (
	`id` varchar(36) NOT NULL,
	`at` bigint NOT NULL,
	`level` varchar(16) NOT NULL,
	`marketplace_code` varchar(20),
	`listing_id` varchar(36),
	`job_run_id` varchar(36),
	`code` text NOT NULL,
	`message` text NOT NULL,
	`context` text,
	CONSTRAINT `app_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` varchar(128) NOT NULL,
	`value` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `app_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `bundle_members` (
	`bundle_stock_code` varchar(64) NOT NULL,
	`member_stock_code` varchar(64) NOT NULL,
	`quantity` int NOT NULL,
	CONSTRAINT `bundle_members_bundle_stock_code_member_stock_code_pk` PRIMARY KEY(`bundle_stock_code`,`member_stock_code`)
);
--> statement-breakpoint
CREATE TABLE `bundles` (
	`bundle_stock_code` varchar(64) NOT NULL,
	`name` text NOT NULL,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `bundles_bundle_stock_code` PRIMARY KEY(`bundle_stock_code`)
);
--> statement-breakpoint
CREATE TABLE `buybox_observations` (
	`id` varchar(36) NOT NULL,
	`listing_id` varchar(36) NOT NULL,
	`observed_at` bigint NOT NULL,
	`rank` int,
	`buybox_price` bigint,
	`second_price` bigint,
	`third_price` bigint,
	`has_multiple_seller` boolean NOT NULL,
	`source` varchar(16) NOT NULL,
	CONSTRAINT `buybox_observations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `competitor_observations` (
	`id` varchar(36) NOT NULL,
	`listing_id` varchar(36) NOT NULL,
	`scrape_run_id` varchar(36) NOT NULL,
	`observed_at` bigint NOT NULL,
	`rank` int NOT NULL,
	`seller_name` text NOT NULL,
	`seller_ref` varchar(128),
	`price` bigint,
	`final_price` bigint,
	`rating` real,
	`dispatch_time` int,
	`offered_stock` int,
	`has_promotion` boolean NOT NULL,
	`promotion_text` text,
	CONSTRAINT `competitor_observations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fee_settings` (
	`id` varchar(36) NOT NULL,
	`marketplace_code` varchar(20) NOT NULL,
	`effective_from` bigint NOT NULL,
	`commission_vat_rate` int NOT NULL,
	`commission_rate_includes_vat` boolean NOT NULL,
	`commission_vat_deductible` boolean NOT NULL,
	`commission_base` varchar(16) NOT NULL,
	`default_commission_rate` real NOT NULL,
	`cargo_bands` text NOT NULL,
	`cargo_amounts_include_vat` boolean NOT NULL,
	`cargo_vat_rate` int NOT NULL,
	`cargo_vat_deductible` boolean NOT NULL,
	`expenditure_bands` text NOT NULL,
	`expenditure_includes_vat` boolean NOT NULL,
	`expenditure_vat_rate` int NOT NULL,
	`expenditure_vat_deductible` boolean NOT NULL,
	CONSTRAINT `fee_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `fee_settings_marketplace_effective_from` UNIQUE(`marketplace_code`,`effective_from`)
);
--> statement-breakpoint
CREATE TABLE `job_queue` (
	`id` varchar(36) NOT NULL,
	`job_name` varchar(64) NOT NULL,
	`payload` text NOT NULL,
	`priority` int NOT NULL,
	`state` varchar(16) NOT NULL,
	`run_after` bigint NOT NULL,
	`locked_by` text,
	`locked_until` bigint,
	`attempts` int NOT NULL,
	`max_attempts` int NOT NULL,
	`last_error` text,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `job_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` varchar(36) NOT NULL,
	`job_name` varchar(64) NOT NULL,
	`started_at` bigint NOT NULL,
	`finished_at` bigint,
	`state` varchar(16) NOT NULL,
	`items_total` int NOT NULL,
	`items_ok` int NOT NULL,
	`items_failed` int NOT NULL,
	`error` text,
	`correlation_id` varchar(64) NOT NULL,
	CONSTRAINT `job_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `listing_campaigns` (
	`id` varchar(36) NOT NULL,
	`listing_id` varchar(36) NOT NULL,
	`final_price` bigint NOT NULL,
	`store_share_pct` real NOT NULL,
	`starts_at` bigint,
	`ends_at` bigint,
	`observed_at` bigint NOT NULL,
	CONSTRAINT `listing_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` varchar(36) NOT NULL,
	`marketplace_code` varchar(20) NOT NULL,
	`marketplace_listing_id` varchar(128) NOT NULL,
	`seller_stock_code` varchar(128) NOT NULL,
	`base_stock_code` varchar(64),
	`unit_count` int NOT NULL,
	`is_bundle` boolean NOT NULL,
	`product_name` text NOT NULL,
	`price` bigint NOT NULL,
	`list_price` bigint,
	`customer_price` bigint,
	`offered_stock` int NOT NULL,
	`commission_rate` real,
	`vat_rate` int,
	`dispatch_time` int,
	`is_salable` boolean NOT NULL,
	`is_locked` boolean NOT NULL,
	`is_suspended` boolean NOT NULL,
	`is_frozen` boolean NOT NULL,
	`is_archived` boolean NOT NULL,
	`is_blacklisted` boolean NOT NULL,
	`lock_reasons` text,
	`deactivation_reasons` text,
	`min_price` bigint,
	`max_price` bigint,
	`allow_increase` boolean NOT NULL,
	`allow_decrease` boolean NOT NULL,
	`reprice_enabled` boolean NOT NULL,
	`extra` text,
	`first_seen_at` bigint NOT NULL,
	`last_seen_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `listings_id` PRIMARY KEY(`id`),
	CONSTRAINT `listings_marketplace_listing_id` UNIQUE(`marketplace_code`,`marketplace_listing_id`)
);
--> statement-breakpoint
CREATE TABLE `marketplaces` (
	`code` varchar(20) NOT NULL,
	`display_name` text NOT NULL,
	`enabled` boolean NOT NULL,
	`merchant_ref` text,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `marketplaces_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
CREATE TABLE `price_submissions` (
	`id` varchar(36) NOT NULL,
	`listing_id` varchar(36) NOT NULL,
	`marketplace_code` varchar(20) NOT NULL,
	`old_price` bigint NOT NULL,
	`new_price` bigint NOT NULL,
	`reason` varchar(32) NOT NULL,
	`explanation` text NOT NULL,
	`priority` int NOT NULL,
	`decided_at` bigint NOT NULL,
	`state` varchar(16) NOT NULL,
	`submitted_at` bigint,
	`confirmed_at` bigint,
	`marketplace_handle` text,
	`failure_code` text,
	`failure_message` text,
	`attempts` int NOT NULL,
	`unit_cost` bigint,
	`floor_price` bigint,
	`buybox_price` bigint,
	`second_price` bigint,
	`rank` int,
	`commission_rate` real,
	`vat_rate` int,
	CONSTRAINT `price_submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repricing_policies` (
	`marketplace_code` varchar(20) NOT NULL,
	`coarse_step_mode` varchar(16) NOT NULL,
	`coarse_step_absolute` bigint,
	`coarse_step_percent` real,
	`refine_tolerance` bigint NOT NULL,
	`seek_strategy` varchar(16) NOT NULL,
	`undercut_by` bigint NOT NULL,
	`seek_step` bigint NOT NULL,
	`sole_seller_margin_pct` real NOT NULL,
	`low_stock_guard_enabled` boolean NOT NULL,
	`low_stock_threshold` int NOT NULL,
	`low_stock_margin_pct` real NOT NULL,
	`stock_mode` varchar(16) NOT NULL,
	`min_physical_stock` int NOT NULL,
	`require_price_confirmation` boolean NOT NULL,
	`settle_duration_ms` int NOT NULL,
	`competitor_price_delta` bigint NOT NULL,
	`use_seller_identity_trigger` boolean NOT NULL,
	`poll_interval_ms` int NOT NULL,
	`concurrency` int NOT NULL,
	`daily_update_allowance_formula` text NOT NULL,
	`budget_reserve_pct` real NOT NULL,
	`enabled` boolean NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `repricing_policies_marketplace_code` PRIMARY KEY(`marketplace_code`)
);
--> statement-breakpoint
CREATE TABLE `repricing_state` (
	`listing_id` varchar(36) NOT NULL,
	`phase` varchar(16) NOT NULL,
	`last_good_price` bigint,
	`last_bad_price` bigint,
	`optimum_price` bigint,
	`optimum_ctx_unit_cost` bigint,
	`optimum_ctx_commission_rate` real,
	`optimum_ctx_vat_rate` int,
	`optimum_ctx_campaign_ratio` real,
	`optimum_ctx_second_price` bigint,
	`optimum_ctx_second_seller_ref` text,
	`pending_submission_id` varchar(36),
	`settle_until` bigint,
	`consecutive_rejections` int NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `repricing_state_listing_id` PRIMARY KEY(`listing_id`)
);
--> statement-breakpoint
CREATE TABLE `scrape_runs` (
	`id` varchar(36) NOT NULL,
	`listing_id` varchar(36) NOT NULL,
	`observed_at` bigint NOT NULL,
	`source` varchar(16) NOT NULL,
	`seller_count` int NOT NULL,
	`payload_hash` varchar(64) NOT NULL,
	`status` varchar(16) NOT NULL,
	`changed` boolean NOT NULL,
	CONSTRAINT `scrape_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings_audit` (
	`id` varchar(36) NOT NULL,
	`entity` varchar(64) NOT NULL,
	`entity_id` varchar(64) NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`changed_by` text NOT NULL,
	`changed_at` bigint NOT NULL,
	CONSTRAINT `settings_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_items` (
	`base_stock_code` varchar(64) NOT NULL,
	`name` text NOT NULL,
	`unit_cost` bigint NOT NULL,
	`unit_stock` int NOT NULL,
	`source_code` varchar(32) NOT NULL,
	`source_ref` text,
	`cost_updated_at` bigint NOT NULL,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `stock_items_base_stock_code` PRIMARY KEY(`base_stock_code`)
);
--> statement-breakpoint
CREATE TABLE `stock_marketplace_prefs` (
	`base_stock_code` varchar(64) NOT NULL,
	`marketplace_code` varchar(20) NOT NULL,
	`price_multiplier` real NOT NULL,
	`auto_reprice_enabled` boolean NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `stock_marketplace_prefs_base_stock_code_marketplace_code_pk` PRIMARY KEY(`base_stock_code`,`marketplace_code`)
);
--> statement-breakpoint
CREATE TABLE `update_budget_usage` (
	`marketplace_code` varchar(20) NOT NULL,
	`usage_date` varchar(10) NOT NULL,
	`consumed` int NOT NULL,
	`allowance` int NOT NULL,
	CONSTRAINT `update_budget_usage_marketplace_code_usage_date_pk` PRIMARY KEY(`marketplace_code`,`usage_date`)
);
--> statement-breakpoint
ALTER TABLE `app_events` ADD CONSTRAINT `app_events_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `app_events` ADD CONSTRAINT `app_events_listing_id_listings_id_fk` FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `app_events` ADD CONSTRAINT `app_events_job_run_id_job_runs_id_fk` FOREIGN KEY (`job_run_id`) REFERENCES `job_runs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bundle_members` ADD CONSTRAINT `fk_bundle_members_bundle_stock_code` FOREIGN KEY (`bundle_stock_code`) REFERENCES `bundles`(`bundle_stock_code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `buybox_observations` ADD CONSTRAINT `buybox_observations_listing_id_listings_id_fk` FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `competitor_observations` ADD CONSTRAINT `competitor_observations_listing_id_listings_id_fk` FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `competitor_observations` ADD CONSTRAINT `competitor_observations_scrape_run_id_scrape_runs_id_fk` FOREIGN KEY (`scrape_run_id`) REFERENCES `scrape_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_settings` ADD CONSTRAINT `fee_settings_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listing_campaigns` ADD CONSTRAINT `listing_campaigns_listing_id_listings_id_fk` FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listings` ADD CONSTRAINT `listings_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listings` ADD CONSTRAINT `listings_base_stock_code_stock_items_base_stock_code_fk` FOREIGN KEY (`base_stock_code`) REFERENCES `stock_items`(`base_stock_code`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_submissions` ADD CONSTRAINT `price_submissions_listing_id_listings_id_fk` FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_submissions` ADD CONSTRAINT `price_submissions_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `repricing_policies` ADD CONSTRAINT `repricing_policies_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `repricing_state` ADD CONSTRAINT `repricing_state_listing_id_listings_id_fk` FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `repricing_state` ADD CONSTRAINT `fk_repricing_state_pending_submission_id` FOREIGN KEY (`pending_submission_id`) REFERENCES `price_submissions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scrape_runs` ADD CONSTRAINT `scrape_runs_listing_id_listings_id_fk` FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_marketplace_prefs` ADD CONSTRAINT `fk_smp_base_stock_code` FOREIGN KEY (`base_stock_code`) REFERENCES `stock_items`(`base_stock_code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_marketplace_prefs` ADD CONSTRAINT `fk_smp_marketplace_code` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `update_budget_usage` ADD CONSTRAINT `update_budget_usage_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `app_events_at` ON `app_events` (`at`);--> statement-breakpoint
CREATE INDEX `app_events_level_at` ON `app_events` (`level`,`at`);--> statement-breakpoint
CREATE INDEX `app_events_listing_at` ON `app_events` (`listing_id`,`at`);--> statement-breakpoint
CREATE INDEX `buybox_observations_listing_observed` ON `buybox_observations` (`listing_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `competitor_observations_listing_observed` ON `competitor_observations` (`listing_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `competitor_observations_seller_observed` ON `competitor_observations` (`seller_ref`,`observed_at`);--> statement-breakpoint
CREATE INDEX `job_queue_claim` ON `job_queue` (`state`,`priority`,`run_after`);--> statement-breakpoint
CREATE INDEX `listing_campaigns_listing_id` ON `listing_campaigns` (`listing_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `listings_base_stock_code` ON `listings` (`base_stock_code`);--> statement-breakpoint
CREATE INDEX `listings_marketplace_salable_reprice` ON `listings` (`marketplace_code`,`is_salable`,`reprice_enabled`);--> statement-breakpoint
CREATE INDEX `listings_seller_stock_code` ON `listings` (`seller_stock_code`);--> statement-breakpoint
CREATE INDEX `price_submissions_listing_decided` ON `price_submissions` (`listing_id`,`decided_at`);--> statement-breakpoint
CREATE INDEX `price_submissions_outbox` ON `price_submissions` (`state`,`priority`,`decided_at`);--> statement-breakpoint
CREATE INDEX `price_submissions_budget` ON `price_submissions` (`marketplace_code`,`confirmed_at`);--> statement-breakpoint
CREATE INDEX `scrape_runs_listing_observed` ON `scrape_runs` (`listing_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `settings_audit_entity` ON `settings_audit` (`entity`,`entity_id`,`changed_at`);