ALTER TABLE `tracked_product_observations` ADD `seller_rating` real;--> statement-breakpoint
ALTER TABLE `tracked_product_observations` ADD `dispatch_time` int;--> statement-breakpoint
ALTER TABLE `tracked_product_observations` ADD `has_promotion` boolean;--> statement-breakpoint
ALTER TABLE `tracked_product_observations` ADD `promotion_text` text;--> statement-breakpoint
ALTER TABLE `tracked_product_observations` ADD `listing_ref` text;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `reference_price` bigint;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `reference_price_source` text;--> statement-breakpoint
ALTER TABLE `tracked_products` ADD `reference_price_updated_at` bigint;