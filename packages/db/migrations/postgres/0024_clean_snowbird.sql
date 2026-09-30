CREATE TABLE "auth_events" (
	"id" text PRIMARY KEY NOT NULL,
	"at" bigint NOT NULL,
	"event" text NOT NULL,
	"user_id" text,
	"actor" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"at" bigint NOT NULL,
	"username" text NOT NULL,
	"ip" text,
	"succeeded" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"attempts" integer NOT NULL,
	"consumed_at" bigint
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" bigint NOT NULL,
	"used_at" bigint
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "sms_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"challenge_id" text,
	"user_id" text NOT NULL,
	"phone_e164" text NOT NULL,
	"code_hmac" text NOT NULL,
	"sent_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"attempts" integer NOT NULL,
	"provider_ref" text,
	"state" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"last_used_at" bigint,
	"label" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"state" text NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean NOT NULL,
	"password_changed_at" bigint NOT NULL,
	"totp_enabled" boolean NOT NULL,
	"totp_last_step" integer,
	"totp_pending_since" bigint,
	"phone_e164" text,
	"phone_verified_at" bigint,
	"sms_enabled" boolean NOT NULL,
	"locked_until" bigint,
	"last_login_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_submissions" ADD COLUMN "requested_by" text;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_codes" ADD CONSTRAINT "sms_codes_challenge_id_mfa_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."mfa_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_codes" ADD CONSTRAINT "sms_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_events_at" ON "auth_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "auth_events_user_at" ON "auth_events" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "login_attempts_username_at" ON "login_attempts" USING btree ("username","at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_at" ON "login_attempts" USING btree ("ip","at");--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_challenges_token_hash" ON "mfa_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "mfa_challenges_user" ON "mfa_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recovery_codes_user" ON "recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sms_codes_user_sent" ON "sms_codes" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE INDEX "sms_codes_phone_sent" ON "sms_codes" USING btree ("phone_e164","sent_at");--> statement-breakpoint
CREATE INDEX "sms_codes_sent" ON "sms_codes" USING btree ("sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trusted_devices_token_hash" ON "trusted_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "trusted_devices_user" ON "trusted_devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username" ON "users" USING btree ("username");