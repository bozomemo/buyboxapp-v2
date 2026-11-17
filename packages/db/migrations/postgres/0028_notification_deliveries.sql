CREATE TABLE "notification_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"channel" text NOT NULL,
	"state" text NOT NULL,
	"attempts" integer NOT NULL,
	"last_error" text,
	"created_at" bigint NOT NULL,
	"sent_at" bigint
);
--> statement-breakpoint
CREATE INDEX "notification_deliveries_state_created" ON "notification_deliveries" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_subject" ON "notification_deliveries" USING btree ("subject_type","subject_id");