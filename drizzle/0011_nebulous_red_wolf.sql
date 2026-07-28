ALTER TABLE "agency_os_ghl_contact" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_contact" ADD COLUMN "attributionSource" jsonb;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_contact" ADD COLUMN "lastAttributionSource" jsonb;