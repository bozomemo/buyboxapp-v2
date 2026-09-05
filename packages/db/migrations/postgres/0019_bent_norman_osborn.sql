CREATE TABLE "brand_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"watched_brand_id" text NOT NULL,
	"finding_key" text NOT NULL,
	"kind" text NOT NULL,
	"basis" text NOT NULL,
	"state" text NOT NULL,
	"magnitude" real NOT NULL,
	"first_seen_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL,
	"resolved_at" bigint,
	"notified_at" bigint,
	"payload" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_findings" ADD CONSTRAINT "brand_findings_watched_brand_id_watched_brands_id_fk" FOREIGN KEY ("watched_brand_id") REFERENCES "public"."watched_brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_findings_brand_state" ON "brand_findings" USING btree ("watched_brand_id","state");--> statement-breakpoint
CREATE INDEX "brand_findings_key_state" ON "brand_findings" USING btree ("finding_key","state");