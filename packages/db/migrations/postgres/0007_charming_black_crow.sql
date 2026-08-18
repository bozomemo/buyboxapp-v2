CREATE TABLE "alert_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_value" text,
	"subject_type" text NOT NULL,
	"subject_value" text,
	"predicate" text NOT NULL,
	"threshold_type" text NOT NULL,
	"threshold_value" bigint,
	"threshold_pct" integer,
	"quiet_period_ms" integer NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_sellers" (
	"id" text PRIMARY KEY NOT NULL,
	"alert_id" text NOT NULL,
	"seller_ref" text,
	"seller_name" text NOT NULL,
	"observed_price" bigint,
	"price_source" text NOT NULL,
	"rank" integer NOT NULL,
	"promotion_text" text,
	"joined_at" bigint NOT NULL,
	"left_at" bigint
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"alert_key" text NOT NULL,
	"listing_id" text NOT NULL,
	"seller_ref" text,
	"state" text NOT NULL,
	"first_seen_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL,
	"resolved_at" bigint,
	"threshold_applied" bigint,
	"snapshot" text
);
--> statement-breakpoint
ALTER TABLE "alert_sellers" ADD CONSTRAINT "alert_sellers_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_sellers_alert" ON "alert_sellers" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "alerts_key_state" ON "alerts" USING btree ("alert_key","state");--> statement-breakpoint
CREATE INDEX "alerts_state_last_seen" ON "alerts" USING btree ("state","last_seen_at");--> statement-breakpoint
CREATE INDEX "alerts_listing" ON "alerts" USING btree ("listing_id");