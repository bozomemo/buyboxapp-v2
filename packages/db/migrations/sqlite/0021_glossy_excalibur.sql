CREATE TABLE `tracked_scrape_passes` (
	`id` text PRIMARY KEY NOT NULL,
	`marketplace_code` text NOT NULL,
	`pass_no` integer NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`planned_count` integer NOT NULL,
	`done_count` integer DEFAULT 0 NOT NULL,
	`ok_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`changed_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tracked_scrape_passes_marketplace_started` ON `tracked_scrape_passes` (`marketplace_code`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_scrape_passes_marketplace_no` ON `tracked_scrape_passes` (`marketplace_code`,`pass_no`);