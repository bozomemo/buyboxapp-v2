CREATE TABLE `auth_events` (
	`id` varchar(36) NOT NULL,
	`at` bigint NOT NULL,
	`event` varchar(40) NOT NULL,
	`user_id` varchar(36),
	`actor` varchar(64) NOT NULL,
	`ip` varchar(64),
	`user_agent` text,
	`detail` text,
	CONSTRAINT `auth_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` varchar(36) NOT NULL,
	`at` bigint NOT NULL,
	`username` varchar(128) NOT NULL,
	`ip` varchar(64),
	`succeeded` boolean NOT NULL,
	CONSTRAINT `login_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mfa_challenges` (
	`id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`created_at` bigint NOT NULL,
	`expires_at` bigint NOT NULL,
	`attempts` int NOT NULL,
	`consumed_at` bigint,
	CONSTRAINT `mfa_challenges_id` PRIMARY KEY(`id`),
	CONSTRAINT `mfa_challenges_token_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `recovery_codes` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`code_hash` varchar(64) NOT NULL,
	`created_at` bigint NOT NULL,
	`used_at` bigint,
	CONSTRAINT `recovery_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`created_at` bigint NOT NULL,
	`last_seen_at` bigint NOT NULL,
	`expires_at` bigint NOT NULL,
	`ip` varchar(64),
	`user_agent` text,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `sms_codes` (
	`id` varchar(36) NOT NULL,
	`purpose` varchar(16) NOT NULL,
	`challenge_id` varchar(36),
	`user_id` varchar(36) NOT NULL,
	`phone_e164` varchar(16) NOT NULL,
	`code_hmac` varchar(64) NOT NULL,
	`sent_at` bigint NOT NULL,
	`expires_at` bigint NOT NULL,
	`attempts` int NOT NULL,
	`provider_ref` text,
	`state` varchar(16) NOT NULL,
	CONSTRAINT `sms_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trusted_devices` (
	`id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`created_at` bigint NOT NULL,
	`expires_at` bigint NOT NULL,
	`last_used_at` bigint,
	`label` text,
	CONSTRAINT `trusted_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `trusted_devices_token_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`username` varchar(32) NOT NULL,
	`display_name` text NOT NULL,
	`role` varchar(20) NOT NULL,
	`state` varchar(16) NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` boolean NOT NULL,
	`password_changed_at` bigint NOT NULL,
	`totp_enabled` boolean NOT NULL,
	`totp_last_step` int,
	`totp_pending_since` bigint,
	`phone_e164` varchar(16),
	`phone_verified_at` bigint,
	`sms_enabled` boolean NOT NULL,
	`locked_until` bigint,
	`last_login_at` bigint,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	`created_by` varchar(64) NOT NULL,
	`updated_by` varchar(64) NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `price_submissions` ADD `requested_by` varchar(64);--> statement-breakpoint
ALTER TABLE `mfa_challenges` ADD CONSTRAINT `fk_mfa_challenges_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recovery_codes` ADD CONSTRAINT `fk_recovery_codes_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `fk_sessions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sms_codes` ADD CONSTRAINT `fk_sms_codes_challenge_id` FOREIGN KEY (`challenge_id`) REFERENCES `mfa_challenges`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sms_codes` ADD CONSTRAINT `fk_sms_codes_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trusted_devices` ADD CONSTRAINT `fk_trusted_devices_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_events_at` ON `auth_events` (`at`);--> statement-breakpoint
CREATE INDEX `auth_events_user_at` ON `auth_events` (`user_id`,`at`);--> statement-breakpoint
CREATE INDEX `login_attempts_username_at` ON `login_attempts` (`username`,`at`);--> statement-breakpoint
CREATE INDEX `login_attempts_ip_at` ON `login_attempts` (`ip`,`at`);--> statement-breakpoint
CREATE INDEX `mfa_challenges_user` ON `mfa_challenges` (`user_id`);--> statement-breakpoint
CREATE INDEX `recovery_codes_user` ON `recovery_codes` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sms_codes_user_sent` ON `sms_codes` (`user_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `sms_codes_phone_sent` ON `sms_codes` (`phone_e164`,`sent_at`);--> statement-breakpoint
CREATE INDEX `sms_codes_sent` ON `sms_codes` (`sent_at`);--> statement-breakpoint
CREATE INDEX `trusted_devices_user` ON `trusted_devices` (`user_id`);