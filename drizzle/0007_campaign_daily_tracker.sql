ALTER TYPE "public"."agency_os_user_role" ADD VALUE 'manager' BEFORE 'client';--> statement-breakpoint
CREATE TABLE "agency_os_campaign_daily_remark" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaignId" uuid NOT NULL,
	"date" date NOT NULL,
	"remark" text NOT NULL,
	"createdByUserId" varchar(255),
	"updatedByUserId" varchar(255),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_daily_remark_not_blank" CHECK (length(trim("agency_os_campaign_daily_remark"."remark")) > 0),
	CONSTRAINT "campaign_daily_remark_max_length" CHECK (length("agency_os_campaign_daily_remark"."remark") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "agency_os_campaign_daily_remark" ADD CONSTRAINT "agency_os_campaign_daily_remark_campaignId_agency_os_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."agency_os_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_campaign_daily_remark" ADD CONSTRAINT "agency_os_campaign_daily_remark_createdByUserId_agency_os_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."agency_os_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_campaign_daily_remark" ADD CONSTRAINT "agency_os_campaign_daily_remark_updatedByUserId_agency_os_user_id_fk" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."agency_os_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_daily_remark_campaign_date_idx" ON "agency_os_campaign_daily_remark" USING btree ("campaignId","date");--> statement-breakpoint
CREATE INDEX "campaign_daily_remark_date_idx" ON "agency_os_campaign_daily_remark" USING btree ("date");