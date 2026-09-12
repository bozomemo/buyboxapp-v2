CREATE TABLE `tracked_scrape_passes` (
	`id` varchar(36) NOT NULL,
	`marketplace_code` varchar(20) NOT NULL,
	`pass_no` int NOT NULL,
	`started_at` bigint NOT NULL,
	`finished_at` bigint,
	`planned_count` int NOT NULL,
	`done_count` int NOT NULL DEFAULT 0,
	`ok_count` int NOT NULL DEFAULT 0,
	`failed_count` int NOT NULL DEFAULT 0,
	`changed_count` int NOT NULL DEFAULT 0,
	CONSTRAINT `tracked_scrape_passes_id` PRIMARY KEY(`id`),
	CONSTRAINT `tracked_scrape_passes_marketplace_no` UNIQUE(`marketplace_code`,`pass_no`)
);
--> statement-breakpoint
ALTER TABLE `tracked_scrape_passes` ADD CONSTRAINT `tracked_scrape_passes_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `tracked_scrape_passes_marketplace_started` ON `tracked_scrape_passes` (`marketplace_code`,`started_at`);