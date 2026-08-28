CREATE TABLE `competitor_seller_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`competitor_seller_id` text NOT NULL,
	`official_name` text,
	`tax_number` text,
	`tax_office` text,
	`registered_email_address` text,
	`address` text,
	`city_name` text,
	`country_name` text,
	`listings_json` text NOT NULL,
	`source_url` text NOT NULL,
	`parser_version` text NOT NULL,
	`resolved_at` integer NOT NULL,
	FOREIGN KEY (`competitor_seller_id`) REFERENCES `competitor_sellers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competitor_seller_identities_seller` ON `competitor_seller_identities` (`competitor_seller_id`);