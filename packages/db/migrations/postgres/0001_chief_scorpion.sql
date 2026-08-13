CREATE TABLE "circuit_breaker_state" (
	"marketplace_code" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"consecutive_failures" integer NOT NULL,
	"opened_at" bigint,
	"last_error" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "circuit_breaker_state" ADD CONSTRAINT "circuit_breaker_state_marketplace_code_marketplaces_code_fk" FOREIGN KEY ("marketplace_code") REFERENCES "public"."marketplaces"("code") ON DELETE cascade ON UPDATE no action;