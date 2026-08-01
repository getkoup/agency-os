CREATE TABLE "agency_os_global_salesperson" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"displayName" varchar(255),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_global_salesperson_identity" (
	"globalSalespersonId" uuid NOT NULL,
	"provider" "agency_os_integration_provider" NOT NULL,
	"externalUserId" varchar(255) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_os_global_salesperson_identity_provider_externalUserId_pk" PRIMARY KEY("provider","externalUserId")
);
--> statement-breakpoint
ALTER TABLE "agency_os_global_salesperson_identity" ADD CONSTRAINT "agency_os_global_salesperson_identity_globalSalespersonId_agency_os_global_salesperson_id_fk" FOREIGN KEY ("globalSalespersonId") REFERENCES "public"."agency_os_global_salesperson"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "global_salesperson_identity_person_idx" ON "agency_os_global_salesperson_identity" USING btree ("globalSalespersonId");--> statement-breakpoint
INSERT INTO "agency_os_global_salesperson" ("id")
SELECT DISTINCT (
  substr(md5('ghl:' || "externalUserId"), 1, 12) ||
  '5' ||
  substr(md5('ghl:' || "externalUserId"), 14, 3) ||
  'a' ||
  substr(md5('ghl:' || "externalUserId"), 18, 15)
)::uuid
FROM "agency_os_salesperson";--> statement-breakpoint
INSERT INTO "agency_os_global_salesperson_identity"
  ("globalSalespersonId", "provider", "externalUserId")
SELECT DISTINCT
  (
    substr(md5('ghl:' || "externalUserId"), 1, 12) ||
    '5' ||
    substr(md5('ghl:' || "externalUserId"), 14, 3) ||
    'a' ||
    substr(md5('ghl:' || "externalUserId"), 18, 15)
  )::uuid,
  'ghl'::"agency_os_integration_provider",
  "externalUserId"
FROM "agency_os_salesperson";