CREATE TABLE `brand_findings` (
	`id` varchar(36) NOT NULL,
	`watched_brand_id` varchar(36) NOT NULL,
	`finding_key` varchar(255) NOT NULL,
	`kind` text NOT NULL,
	`basis` text NOT NULL,
	`state` varchar(20) NOT NULL,
	`magnitude` real NOT NULL,
	`first_seen_at` bigint NOT NULL,
	`last_seen_at` bigint NOT NULL,
	`resolved_at` bigint,
	`notified_at` bigint,
	`payload` text NOT NULL,
	CONSTRAINT `brand_findings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `brand_findings` ADD CONSTRAINT `fk_brand_findings_watched_brand_id` FOREIGN KEY (`watched_brand_id`) REFERENCES `watched_brands`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `brand_findings_brand_state` ON `brand_findings` (`watched_brand_id`,`state`);--> statement-breakpoint
CREATE INDEX `brand_findings_key_state` ON `brand_findings` (`finding_key`,`state`);