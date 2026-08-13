CREATE TYPE "public"."agency_os_sales_commission_v2_match_field" AS ENUM('category', 'service');--> statement-breakpoint
CREATE TABLE "agency_os_sales_commission_v2_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"normalizedName" varchar(100) NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"status" "agency_os_record_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_commission_v2_category_id_client_unique" UNIQUE("id","clientId"),
	CONSTRAINT "sales_commission_v2_category_normalized_not_blank" CHECK (length(trim("agency_os_sales_commission_v2_category"."normalizedName")) > 0),
	CONSTRAINT "sales_commission_v2_category_sort_nonnegative" CHECK ("agency_os_sales_commission_v2_category"."sortOrder" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agency_os_sales_commission_v2_mapping_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"categoryId" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"field" "agency_os_sales_commission_v2_match_field" NOT NULL,
	"keywords" text[] NOT NULL,
	"matchMode" "agency_os_lead_rule_match_mode" DEFAULT 'any' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" "agency_os_record_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_commission_v2_rule_keywords_not_empty" CHECK (cardinality("agency_os_sales_commission_v2_mapping_rule"."keywords") > 0),
	CONSTRAINT "sales_commission_v2_rule_priority_nonnegative" CHECK ("agency_os_sales_commission_v2_mapping_rule"."priority" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agency_os_sales_commission_v2_setting" (
	"clientId" uuid PRIMARY KEY NOT NULL,
	"attributionMode" "agency_os_salesperson_attribution_mode" DEFAULT 'created_by' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_salesperson_commission_v2_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"salespersonExternalUserId" varchar(255) NOT NULL,
	"categoryId" uuid NOT NULL,
	"commissionValue" numeric(14, 2) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salesperson_commission_v2_value_nonnegative" CHECK ("agency_os_salesperson_commission_v2_rate"."commissionValue" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agency_os_sales_commission_v2_category" ADD CONSTRAINT "agency_os_sales_commission_v2_category_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_sales_commission_v2_mapping_rule" ADD CONSTRAINT "agency_os_sales_commission_v2_mapping_rule_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_sales_commission_v2_mapping_rule" ADD CONSTRAINT "sales_commission_v2_rule_category_client_fk" FOREIGN KEY ("categoryId","clientId") REFERENCES "public"."agency_os_sales_commission_v2_category"("id","clientId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_sales_commission_v2_setting" ADD CONSTRAINT "agency_os_sales_commission_v2_setting_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_salesperson_commission_v2_rate" ADD CONSTRAINT "agency_os_salesperson_commission_v2_rate_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_salesperson_commission_v2_rate" ADD CONSTRAINT "salesperson_commission_v2_salesperson_client_fk" FOREIGN KEY ("clientId","salespersonExternalUserId") REFERENCES "public"."agency_os_salesperson"("clientId","externalUserId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_salesperson_commission_v2_rate" ADD CONSTRAINT "salesperson_commission_v2_category_client_fk" FOREIGN KEY ("categoryId","clientId") REFERENCES "public"."agency_os_sales_commission_v2_category"("id","clientId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_commission_v2_category_client_normalized_idx" ON "agency_os_sales_commission_v2_category" USING btree ("clientId","normalizedName");--> statement-breakpoint
CREATE INDEX "sales_commission_v2_category_client_status_sort_idx" ON "agency_os_sales_commission_v2_category" USING btree ("clientId","status","sortOrder");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_commission_v2_rule_client_name_lower_idx" ON "agency_os_sales_commission_v2_mapping_rule" USING btree ("clientId",lower("name"));--> statement-breakpoint
CREATE INDEX "sales_commission_v2_rule_client_status_priority_idx" ON "agency_os_sales_commission_v2_mapping_rule" USING btree ("clientId","status","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "salesperson_commission_v2_person_category_idx" ON "agency_os_salesperson_commission_v2_rate" USING btree ("clientId","salespersonExternalUserId","categoryId");--> statement-breakpoint
CREATE INDEX "salesperson_commission_v2_client_idx" ON "agency_os_salesperson_commission_v2_rate" USING btree ("clientId");