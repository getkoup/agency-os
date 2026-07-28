ALTER TABLE "agency_os_ghl_opportunity" ADD COLUMN "source" text;--> statement-breakpoint
UPDATE "agency_os_integration_mapping"
SET "lastSuccessfulSyncAt" = NULL
WHERE "provider" = 'ghl';