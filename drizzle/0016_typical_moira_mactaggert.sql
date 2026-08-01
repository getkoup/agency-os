ALTER TABLE "agency_os_salesperson" ALTER COLUMN "displayName" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_os_salesperson" ADD COLUMN "providerName" varchar(255);