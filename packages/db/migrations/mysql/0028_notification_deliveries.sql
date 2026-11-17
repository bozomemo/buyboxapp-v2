CREATE TABLE `notification_deliveries` (
	`id` varchar(36) NOT NULL,
	`subject_type` varchar(32) NOT NULL,
	`subject_id` varchar(36) NOT NULL,
	`channel` varchar(16) NOT NULL,
	`state` varchar(16) NOT NULL,
	`attempts` int NOT NULL,
	`last_error` text,
	`created_at` bigint NOT NULL,
	`sent_at` bigint,
	CONSTRAINT `notification_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `notification_deliveries_state_created` ON `notification_deliveries` (`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_subject` ON `notification_deliveries` (`subject_type`,`subject_id`);