CREATE TABLE "app_events" (
	"id" text PRIMARY KEY NOT NULL,
	"at" bigint NOT NULL,
	"level" text NOT NULL,
	"marketplace_code" text,
	"listing_id" text,
	"job_run_id" text,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"context" text
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bundle_members" (
	"bundle_stock_code" text NOT NULL,
	"member_stock_code" text NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "bundle_members_bundle_stock_code_member_stock_code_pk" PRIMARY KEY("bundle_stock_code","member_stock_code")
);
--> statement-breakpoint
CREATE TABLE "bundles" (
	"bundle_stock_code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buybox_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"observed_at" bigint NOT NULL,
	"rank" integer,
	"buybox_price" bigint,
	"second_price" bigint,
	"third_price" bigint,
	"has_multiple_seller" boolean NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"scrape_run_id" text NOT NULL,
	"observed_at" bigint NOT NULL,
	"rank" integer NOT NULL,
	"seller_name" text NOT NULL,
	"seller_ref" text,
	"price" bigint,
	"final_price" bigint,
	"rating" real,
	"dispatch_time" integer,
	"offered_stock" integer,
	"has_promotion" boolean NOT NULL,
	"promotion_text" text
);
--> statement-breakpoint
CREATE TABLE "fee_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"marketplace_code" text NOT NULL,
	"effective_from" bigint NOT NULL,
	"commission_vat_rate" integer NOT NULL,
	"commission_rate_includes_vat" boolean NOT NULL,
	"commission_vat_deductible" boolean NOT NULL,
	"commission_base" text NOT NULL,
	"default_commission_rate" real NOT NULL,
	"cargo_bands" text NOT NULL,
	"cargo_amounts_include_vat" boolean NOT NULL,
	"cargo_vat_rate" integer NOT NULL,
	"cargo_vat_deductible" boolean NOT NULL,
	"expenditure_bands" text NOT NULL,
	"expenditure_includes_vat" boolean NOT NULL,
	"expenditure_vat_rate" integer NOT NULL,
	"expenditure_vat_deductible" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"payload" text NOT NULL,
	"priority" integer NOT NULL,
	"state" text NOT NULL,
	"run_after" bigint NOT NULL,
	"locked_by" text,
	"locked_until" bigint,
	"attempts" integer NOT NULL,
	"max_attempts" integer NOT NULL,
	"last_error" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"started_at" bigint NOT NULL,
	"finished_at" bigint,
	"state" text NOT NULL,
	"items_total" integer NOT NULL,
	"items_ok" integer NOT NULL,
	"items_failed" integer NOT NULL,
	"error" text,
	"correlation_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"final_price" bigint NOT NULL,
	"store_share_pct" real NOT NULL,
	"starts_at" bigint,
	"ends_at" bigint,
	"observed_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" text PRIMARY KEY NOT NULL,
	"marketplace_code" text NOT NULL,
	"marketplace_listing_id" text NOT NULL,
	"seller_stock_code" text NOT NULL,
	"base_stock_code" text,
	"unit_count" integer NOT NULL,
	"is_bundle" boolean NOT NULL,
	"product_name" text NOT NULL,
	"price" bigint NOT NULL,
	"list_price" bigint,
	"customer_price" bigint,
	"offered_stock" integer NOT NULL,
	"commission_rate" real,
	"vat_rate" integer,
	"dispatch_time" integer,
	"is_salable" boolean NOT NULL,
	"is_locked" boolean NOT NULL,
	"is_suspended" boolean NOT NULL,
	"is_frozen" boolean NOT NULL,
	"is_archived" boolean NOT NULL,
	"is_blacklisted" boolean NOT NULL,
	"lock_reasons" text,
	"deactivation_reasons" text,
	"min_price" bigint,
	"max_price" bigint,
	"allow_increase" boolean NOT NULL,
	"allow_decrease" boolean NOT NULL,
	"reprice_enabled" boolean NOT NULL,
	"extra" text,
	"first_seen_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplaces" (
	"code" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean NOT NULL,
	"merchant_ref" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"marketplace_code" text NOT NULL,
	"old_price" bigint NOT NULL,
	"new_price" bigint NOT NULL,
	"reason" text NOT NULL,
	"explanation" text NOT NULL,
	"priority" integer NOT NULL,
	"decided_at" bigint NOT NULL,
	"state" text NOT NULL,
	"submitted_at" bigint,
	"confirmed_at" bigint,
	"marketplace_handle" text,
	"failure_code" text,
	"failure_message" text,
	"attempts" integer NOT NULL,
	"unit_cost" bigint,
	"floor_price" bigint,
	"buybox_price" bigint,
	"second_price" bigint,
	"rank" integer,
	"commission_rate" real,
	"vat_rate" integer
);
--> statement-breakpoint
CREATE TABLE "repricing_policies" (
	"marketplace_code" text PRIMARY KEY NOT NULL,
	"coarse_step_mode" text NOT NULL,
	"coarse_step_absolute" bigint,
	"coarse_step_percent" real,
	"refine_tolerance" bigint NOT NULL,
	"seek_strategy" text NOT NULL,
	"undercut_by" bigint NOT NULL,
	"seek_step" bigint NOT NULL,
	"sole_seller_margin_pct" real NOT NULL,
	"low_stock_guard_enabled" boolean NOT NULL,
	"low_stock_threshold" integer NOT NULL,
	"low_stock_margin_pct" real NOT NULL,
	"stock_mode" text NOT NULL,
	"min_physical_stock" integer NOT NULL,
	"require_price_confirmation" boolean NOT NULL,
	"settle_duration_ms" integer NOT NULL,
	"competitor_price_delta" bigint NOT NULL,
	"use_seller_identity_trigger" boolean NOT NULL,
	"poll_interval_ms" integer NOT NULL,
	"concurrency" integer NOT NULL,
	"daily_update_allowance_formula" text NOT NULL,
	"budget_reserve_pct" real NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repricing_state" (
	"listing_id" text PRIMARY KEY NOT NULL,
	"phase" text NOT NULL,
	"last_good_price" bigint,
	"last_bad_price" bigint,
	"optimum_price" bigint,
	"optimum_ctx_unit_cost" bigint,
	"optimum_ctx_commission_rate" real,
	"optimum_ctx_vat_rate" integer,
	"optimum_ctx_campaign_ratio" real,
	"optimum_ctx_second_price" bigint,
	"optimum_ctx_second_seller_ref" text,
	"pending_submission_id" text,
	"settle_until" bigint,
	"consecutive_rejections" integer NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"observed_at" bigint NOT NULL,
	"source" text NOT NULL,
	"seller_count" integer NOT NULL,
	"payload_hash" text NOT NULL,
	"status" text NOT NULL,
	"changed" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by" text NOT NULL,
	"changed_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_items" (
	"base_stock_code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit_cost" bigint NOT NULL,
	"unit_stock" integer NOT NULL,
	"source_code" text NOT NULL,
	"source_ref" text,
	"cost_updated_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_marketplace_prefs" (
	"base_stock_code" text NOT NULL,
	"marketplace_code" text NOT NULL,
	"price_multiplier" real NOT NULL,
	"auto_reprice_enabled" boolean NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "stock_marketplace_prefs_base_stock_code_marketplace_code_pk" PRIMARY KEY("base_stock_code","marketplace_code")
);
--> statement-breakpoint
CREATE TABLE "update_budget_usage" (
	"marketplace_code" text NOT NULL,
	"usage_date" text NOT NULL,
	"consumed" integer NOT NULL,
	"allowance" integer NOT NULL,
	CONSTRAINT "update_budget_usage_marketplace_code_usage_date_pk" PRIMARY KEY("marketplace_code","usage_date")
);
--> statement-breakpoint
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_members" ADD CONSTRAINT "fk_bundle_members_bundle_stock_code" FOREIGN KEY ("bundle_stock_code") REFERENCES "public"."bundles"("bundle_stock_code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buybox_observations" ADD CONSTRAINT "buybox_observations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_scrape_run_id_scrape_runs_id_fk" FOREIGN KEY ("scrape_run_id") REFERENCES "public"."scrape_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_settings" ADD CONSTRAINT "fee_settings_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_campaigns" ADD CONSTRAINT "listing_campaigns_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_base_stock_code_stock_items_base_stock_code_fk" FOREIGN KEY ("base_stock_code") REFERENCES "public"."stock_items"("base_stock_code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_submissions" ADD CONSTRAINT "price_submissions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_submissions" ADD CONSTRAINT "price_submissions_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repricing_policies" ADD CONSTRAINT "repricing_policies_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repricing_state" ADD CONSTRAINT "repricing_state_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repricing_state" ADD CONSTRAINT "fk_repricing_state_pending_submission_id" FOREIGN KEY ("pending_submission_id") REFERENCES "public"."price_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_marketplace_prefs" ADD CONSTRAINT "fk_smp_base_stock_code" FOREIGN KEY ("base_stock_code") REFERENCES "public"."stock_items"("base_stock_code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_marketplace_prefs" ADD CONSTRAINT "fk_smp_marketplace_code" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_budget_usage" ADD CONSTRAINT "update_budget_usage_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_events_at" ON "app_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "app_events_level_at" ON "app_events" USING btree ("level","at");--> statement-breakpoint
CREATE INDEX "app_events_listing_at" ON "app_events" USING btree ("listing_id","at");--> statement-breakpoint
CREATE INDEX "buybox_observations_listing_observed" ON "buybox_observations" USING btree ("listing_id","observed_at");--> statement-breakpoint
CREATE INDEX "competitor_observations_listing_observed" ON "competitor_observations" USING btree ("listing_id","observed_at");--> statement-breakpoint
CREATE INDEX "competitor_observations_seller_observed" ON "competitor_observations" USING btree ("seller_ref","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_settings_marketplace_effective_from" ON "fee_settings" USING btree ("marketplace_code","effective_from");--> statement-breakpoint
CREATE INDEX "job_queue_claim" ON "job_queue" USING btree ("state","priority","run_after");--> statement-breakpoint
CREATE INDEX "listing_campaigns_listing_id" ON "listing_campaigns" USING btree ("listing_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_marketplace_listing_id" ON "listings" USING btree ("marketplace_code","marketplace_listing_id");--> statement-breakpoint
CREATE INDEX "listings_base_stock_code" ON "listings" USING btree ("base_stock_code");--> statement-breakpoint
CREATE INDEX "listings_marketplace_salable_reprice" ON "listings" USING btree ("marketplace_code","is_salable","reprice_enabled");--> statement-breakpoint
CREATE INDEX "listings_seller_stock_code" ON "listings" USING btree ("seller_stock_code");--> statement-breakpoint
CREATE INDEX "price_submissions_listing_decided" ON "price_submissions" USING btree ("listing_id","decided_at");--> statement-breakpoint
CREATE INDEX "price_submissions_outbox" ON "price_submissions" USING btree ("state","priority","decided_at");--> statement-breakpoint
CREATE INDEX "price_submissions_budget" ON "price_submissions" USING btree ("marketplace_code","confirmed_at");--> statement-breakpoint
CREATE INDEX "scrape_runs_listing_observed" ON "scrape_runs" USING btree ("listing_id","observed_at");--> statement-breakpoint
CREATE INDEX "settings_audit_entity" ON "settings_audit" USING btree ("entity","entity_id","changed_at");