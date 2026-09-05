ALTER TABLE `tracked_product_observations` ADD `seller_rating` real;--> statement-breakpoint
ALTER TABLE `tracked_product_observations` ADD `dispatch_time` integer;--> statement-breakpoint
ALTER TABLE `tracked_product_observations` ADD `has_promotion` integer;--> statement-breakpoint
ALTER TABLE `tracked_product_observations` ADD `promotion_text` text;--> statement-breakpoint
ALTER TABLE `tracked_product_observations` ADD `listing_ref` text;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `reference_price` text;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `reference_price_source` text;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `reference_price_updated_at` integer;