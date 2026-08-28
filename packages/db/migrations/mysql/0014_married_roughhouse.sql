CREATE TABLE `competitor_seller_identities` (
	`id` varchar(36) NOT NULL,
	`competitor_seller_id` varchar(36) NOT NULL,
	`official_name` text,
	`tax_number` varchar(32),
	`tax_office` varchar(128),
	`registered_email_address` varchar(255),
	`address` text,
	`city_name` varchar(128),
	`country_name` varchar(128),
	`listings_json` text NOT NULL,
	`source_url` text NOT NULL,
	`parser_version` varchar(32) NOT NULL,
	`resolved_at` bigint NOT NULL,
	CONSTRAINT `competitor_seller_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `competitor_seller_identities_seller` UNIQUE(`competitor_seller_id`)
);
--> statement-breakpoint
ALTER TABLE `competitor_seller_identities` ADD CONSTRAINT `fk_competitor_seller_identities_seller` FOREIGN KEY (`competitor_seller_id`) REFERENCES `competitor_sellers`(`id`) ON DELETE cascade ON UPDATE no action;