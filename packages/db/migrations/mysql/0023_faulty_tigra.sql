ALTER TABLE `tracked_scrape_passes` DROP INDEX `tracked_scrape_passes_marketplace_no`;--> statement-breakpoint
ALTER TABLE `tracked_scrape_passes` ADD `scope` varchar(10) DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracked_scrape_passes` ADD CONSTRAINT `tracked_scrape_passes_marketplace_scope_no` UNIQUE(`marketplace_code`,`scope`,`pass_no`);