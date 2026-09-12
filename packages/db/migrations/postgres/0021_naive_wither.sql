CREATE TABLE "tracked_scrape_passes" (
	"id" text PRIMARY KEY NOT NULL,
	"marketplace_code" text NOT NULL,
	"pass_no" integer NOT NULL,
	"started_at" bigint NOT NULL,
	"finished_at" bigint,
	"planned_count" integer NOT NULL,
	"done_count" integer DEFAULT 0 NOT NULL,
	"ok_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"changed_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracked_scrape_passes" ADD CONSTRAINT "tracked_scrape_passes_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracked_scrape_passes_marketplace_started" ON "tracked_scrape_passes" USING btree ("marketplace_code","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_scrape_passes_marketplace_no" ON "tracked_scrape_passes" USING btree ("marketplace_code","pass_no");