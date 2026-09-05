CREATE TABLE `brand_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`watched_brand_id` text NOT NULL,
	`finding_key` text NOT NULL,
	`kind` text NOT NULL,
	`basis` text NOT NULL,
	`state` text NOT NULL,
	`magnitude` real NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`resolved_at` integer,
	`notified_at` integer,
	`payload` text NOT NULL,
	FOREIGN KEY (`watched_brand_id`) REFERENCES `watched_brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `brand_findings_brand_state` ON `brand_findings` (`watched_brand_id`,`state`);--> statement-breakpoint
CREATE INDEX `brand_findings_key_state` ON `brand_findings` (`finding_key`,`state`);