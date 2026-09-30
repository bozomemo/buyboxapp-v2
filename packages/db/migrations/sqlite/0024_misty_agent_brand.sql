CREATE TABLE `auth_events` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`event` text NOT NULL,
	`user_id` text,
	`actor` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `auth_events_at` ON `auth_events` (`at`);--> statement-breakpoint
CREATE INDEX `auth_events_user_at` ON `auth_events` (`user_id`,`at`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`username` text NOT NULL,
	`ip` text,
	`succeeded` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_username_at` ON `login_attempts` (`username`,`at`);--> statement-breakpoint
CREATE INDEX `login_attempts_ip_at` ON `login_attempts` (`ip`,`at`);--> statement-breakpoint
CREATE TABLE `mfa_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mfa_challenges_token_hash` ON `mfa_challenges` (`token_hash`);--> statement-breakpoint
CREATE INDEX `mfa_challenges_user` ON `mfa_challenges` (`user_id`);--> statement-breakpoint
CREATE TABLE `recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recovery_codes_user` ON `recovery_codes` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ip` text,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `sms_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`challenge_id` text,
	`user_id` text NOT NULL,
	`phone_e164` text NOT NULL,
	`code_hmac` text NOT NULL,
	`sent_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer NOT NULL,
	`provider_ref` text,
	`state` text NOT NULL,
	FOREIGN KEY (`challenge_id`) REFERENCES `mfa_challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sms_codes_user_sent` ON `sms_codes` (`user_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `sms_codes_phone_sent` ON `sms_codes` (`phone_e164`,`sent_at`);--> statement-breakpoint
CREATE INDEX `sms_codes_sent` ON `sms_codes` (`sent_at`);--> statement-breakpoint
CREATE TABLE `trusted_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`label` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trusted_devices_token_hash` ON `trusted_devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `trusted_devices_user` ON `trusted_devices` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`state` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer NOT NULL,
	`password_changed_at` integer NOT NULL,
	`totp_enabled` integer NOT NULL,
	`totp_last_step` integer,
	`totp_pending_since` integer,
	`phone_e164` text,
	`phone_verified_at` integer,
	`sms_enabled` integer NOT NULL,
	`locked_until` integer,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username` ON `users` (`username`);--> statement-breakpoint
ALTER TABLE `price_submissions` ADD `requested_by` text;