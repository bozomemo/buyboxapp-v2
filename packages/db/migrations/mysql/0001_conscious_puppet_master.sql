CREATE TABLE `circuit_breaker_state` (
	`marketplace_code` varchar(20) NOT NULL,
	`state` varchar(16) NOT NULL,
	`consecutive_failures` int NOT NULL,
	`opened_at` bigint,
	`last_error` text,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `circuit_breaker_state_marketplace_code` PRIMARY KEY(`marketplace_code`)
);
--> statement-breakpoint
ALTER TABLE `circuit_breaker_state` ADD CONSTRAINT `circuit_breaker_state_marketplace_code_marketplaces_code_fk` FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON DELETE cascade ON UPDATE no action;