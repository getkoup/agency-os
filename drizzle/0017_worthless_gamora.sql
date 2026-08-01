UPDATE "agency_os_salesperson"
SET "displayName" = NULL
WHERE "nameIsPlaceholder";--> statement-breakpoint
ALTER TABLE "agency_os_salesperson" DROP COLUMN "nameIsPlaceholder";