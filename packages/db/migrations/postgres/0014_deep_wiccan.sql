CREATE TABLE "competitor_seller_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"competitor_seller_id" text NOT NULL,
	"official_name" text,
	"tax_number" text,
	"tax_office" text,
	"registered_email_address" text,
	"address" text,
	"city_name" text,
	"country_name" text,
	"listings_json" text NOT NULL,
	"source_url" text NOT NULL,
	"parser_version" text NOT NULL,
	"resolved_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitor_seller_identities" ADD CONSTRAINT "fk_competitor_seller_identities_seller" FOREIGN KEY ("competitor_seller_id") REFERENCES "public"."competitor_sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_seller_identities_seller" ON "competitor_seller_identities" USING btree ("competitor_seller_id");