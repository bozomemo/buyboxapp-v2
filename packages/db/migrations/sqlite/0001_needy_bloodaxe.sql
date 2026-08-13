CREATE TABLE `circuit_breaker_state` (
	`marketplace_code` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`consecutive_failures` integer NOT NULL,
	`opened_at` integer,
	`last_error` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`marketplace_code`) REFERENCES `marketplaces`(`code`) ON UPDATE no action ON DELETE cascade
);
