ALTER TABLE "job_runs" ADD COLUMN "items_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "current_item" text;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "progress_at" bigint;