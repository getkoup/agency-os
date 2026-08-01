CREATE TABLE "agency_os_setting" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"reportingTimezone" varchar(100) DEFAULT 'UTC' NOT NULL,
	"updatedByUserId" varchar(255),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setting_singleton" CHECK ("agency_os_setting"."id" = 1),
	CONSTRAINT "setting_reporting_timezone_not_blank" CHECK (length(trim("agency_os_setting"."reportingTimezone")) > 0)
);
--> statement-breakpoint
ALTER TABLE "agency_os_setting" ADD CONSTRAINT "agency_os_setting_updatedByUserId_agency_os_user_id_fk" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."agency_os_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "agency_os_setting" ("id", "reportingTimezone")
VALUES (1, 'UTC')
ON CONFLICT ("id") DO NOTHING;