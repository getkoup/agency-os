CREATE TYPE "public"."agency_os_lead_rule_match_mode" AS ENUM('any', 'all');--> statement-breakpoint
CREATE TABLE "agency_os_lead_classification_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"categoryName" varchar(100) NOT NULL,
	"keywords" text[] NOT NULL,
	"matchMode" "agency_os_lead_rule_match_mode" DEFAULT 'any' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" "agency_os_record_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_classification_keywords_not_empty" CHECK (cardinality("agency_os_lead_classification_rule"."keywords") > 0),
	CONSTRAINT "lead_classification_priority_non_negative" CHECK ("agency_os_lead_classification_rule"."priority" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agency_os_lead_classification_rule" ADD CONSTRAINT "agency_os_lead_classification_rule_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_classification_client_category_lower_idx" ON "agency_os_lead_classification_rule" USING btree ("clientId",lower("categoryName"));--> statement-breakpoint
CREATE INDEX "lead_classification_client_status_priority_idx" ON "agency_os_lead_classification_rule" USING btree ("clientId","status","priority");--> statement-breakpoint
INSERT INTO "agency_os_lead_classification_rule" ("clientId", "categoryName", "keywords", "matchMode", "priority")
SELECT client."id", seed."categoryName", seed."keywords", seed."matchMode", seed."priority"
FROM "agency_os_client" client
CROSS JOIN (
	VALUES
		('Tint', ARRAY['tint']::text[], 'any'::"agency_os_lead_rule_match_mode", 100),
		('PPF', ARRAY['ppf', 'paint protection film']::text[], 'any'::"agency_os_lead_rule_match_mode", 90),
		('Ceramic Coating', ARRAY['coating', 'ceramic']::text[], 'any'::"agency_os_lead_rule_match_mode", 80)
) AS seed("categoryName", "keywords", "matchMode", "priority")
WHERE client."slug" = 'tint-lab';