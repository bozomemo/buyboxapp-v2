DROP INDEX `tracked_scrape_passes_marketplace_no`;--> statement-breakpoint
ALTER TABLE `tracked_scrape_passes` ADD `scope` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_scrape_passes_marketplace_scope_no` ON `tracked_scrape_passes` (`marketplace_code`,`scope`,`pass_no`);