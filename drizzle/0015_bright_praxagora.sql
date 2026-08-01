CREATE TYPE "public"."agency_os_salesperson_attribution_mode" AS ENUM('created_by', 'assigned_user', 'created_by_then_assigned');--> statement-breakpoint
CREATE TABLE "agency_os_sales_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"status" "agency_os_record_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_category_sort_nonnegative" CHECK ("agency_os_sales_category"."sortOrder" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agency_os_sales_commission_setting" (
	"clientId" uuid PRIMARY KEY NOT NULL,
	"attributionMode" "agency_os_salesperson_attribution_mode" DEFAULT 'created_by' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_sales_offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"categoryId" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"keywords" text[] NOT NULL,
	"matchMode" "agency_os_lead_rule_match_mode" DEFAULT 'any' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"revenueValue" numeric(14, 2) NOT NULL,
	"status" "agency_os_record_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_offer_keywords_not_empty" CHECK (cardinality("agency_os_sales_offer"."keywords") > 0),
	CONSTRAINT "sales_offer_priority_nonnegative" CHECK ("agency_os_sales_offer"."priority" >= 0),
	CONSTRAINT "sales_offer_revenue_nonnegative" CHECK ("agency_os_sales_offer"."revenueValue" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agency_os_salesperson" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"externalUserId" varchar(255) NOT NULL,
	"displayName" varchar(255) NOT NULL,
	"nameIsPlaceholder" boolean DEFAULT true NOT NULL,
	"status" "agency_os_record_status" DEFAULT 'active' NOT NULL,
	"firstSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_salesperson_commission_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"salespersonId" uuid NOT NULL,
	"categoryId" uuid NOT NULL,
	"commissionValue" numeric(14, 2) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salesperson_commission_value_nonnegative" CHECK ("agency_os_salesperson_commission_rate"."commissionValue" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agency_os_ghl_appointment" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_appointment" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_appointment" ADD COLUMN "assignedUserExternalId" varchar(255);--> statement-breakpoint
ALTER TABLE "agency_os_ghl_appointment" ADD COLUMN "createdByUserExternalId" varchar(255);--> statement-breakpoint
ALTER TABLE "agency_os_ghl_appointment" ADD COLUMN "createdBySource" varchar(100);--> statement-breakpoint
ALTER TABLE "agency_os_sales_category" ADD CONSTRAINT "agency_os_sales_category_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_sales_commission_setting" ADD CONSTRAINT "agency_os_sales_commission_setting_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_sales_offer" ADD CONSTRAINT "agency_os_sales_offer_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_sales_offer" ADD CONSTRAINT "agency_os_sales_offer_categoryId_agency_os_sales_category_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."agency_os_sales_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_salesperson" ADD CONSTRAINT "agency_os_salesperson_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_salesperson_commission_rate" ADD CONSTRAINT "agency_os_salesperson_commission_rate_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_salesperson_commission_rate" ADD CONSTRAINT "agency_os_salesperson_commission_rate_salespersonId_agency_os_salesperson_id_fk" FOREIGN KEY ("salespersonId") REFERENCES "public"."agency_os_salesperson"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_salesperson_commission_rate" ADD CONSTRAINT "agency_os_salesperson_commission_rate_categoryId_agency_os_sales_category_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."agency_os_sales_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_category_client_name_lower_idx" ON "agency_os_sales_category" USING btree ("clientId",lower("name"));--> statement-breakpoint
CREATE INDEX "sales_category_client_status_sort_idx" ON "agency_os_sales_category" USING btree ("clientId","status","sortOrder");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_offer_client_name_lower_idx" ON "agency_os_sales_offer" USING btree ("clientId",lower("name"));--> statement-breakpoint
CREATE INDEX "sales_offer_client_status_priority_idx" ON "agency_os_sales_offer" USING btree ("clientId","status","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "salesperson_client_external_idx" ON "agency_os_salesperson" USING btree ("clientId","externalUserId");--> statement-breakpoint
CREATE INDEX "salesperson_client_status_idx" ON "agency_os_salesperson" USING btree ("clientId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "salesperson_commission_person_category_idx" ON "agency_os_salesperson_commission_rate" USING btree ("salespersonId","categoryId");--> statement-breakpoint
CREATE INDEX "salesperson_commission_client_idx" ON "agency_os_salesperson_commission_rate" USING btree ("clientId");