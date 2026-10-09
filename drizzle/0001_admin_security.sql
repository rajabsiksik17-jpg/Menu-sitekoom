ALTER TABLE "platform_admins" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "totp_last_step" integer;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "failed_logins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "locked_until" timestamp with time zone;