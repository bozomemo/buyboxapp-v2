ALTER TABLE `job_runs` ADD `items_done` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `job_runs` ADD `current_item` text;--> statement-breakpoint
ALTER TABLE `job_runs` ADD `progress_at` integer;