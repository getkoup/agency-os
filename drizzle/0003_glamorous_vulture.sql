CREATE TABLE "agency_os_revenue_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"tagName" varchar(255) NOT NULL,
	"revenueValue" numeric(14, 2) NOT NULL,
	"serviceName" varchar(255),
	"status" "agency_os_record_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_rule_value_non_negative" CHECK ("agency_os_revenue_rule"."revenueValue" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agency_os_ghl_contact" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_opportunity" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_os_revenue_rule" ADD CONSTRAINT "agency_os_revenue_rule_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_rule_client_tag_lower_idx" ON "agency_os_revenue_rule" USING btree ("clientId",lower("tagName"));--> statement-breakpoint
CREATE INDEX "revenue_rule_client_status_idx" ON "agency_os_revenue_rule" USING btree ("clientId","status");--> statement-breakpoint