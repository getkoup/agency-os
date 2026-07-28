CREATE TYPE "public"."agency_os_appointment_status" AS ENUM('new', 'confirmed', 'showed', 'cancelled', 'noshow', 'invalid');--> statement-breakpoint
CREATE TABLE "agency_os_ghl_appointment_match" (
	"appointmentId" uuid PRIMARY KEY NOT NULL,
	"leadId" uuid,
	"status" "agency_os_opportunity_match_status" NOT NULL,
	"method" "agency_os_opportunity_match_method",
	"candidateCount" integer NOT NULL,
	"matchedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ghl_appointment_match_consistency" CHECK (("agency_os_ghl_appointment_match"."status" = 'matched' AND "agency_os_ghl_appointment_match"."leadId" IS NOT NULL AND "agency_os_ghl_appointment_match"."method" IS NOT NULL AND "agency_os_ghl_appointment_match"."candidateCount" = 1) OR ("agency_os_ghl_appointment_match"."status" <> 'matched' AND "agency_os_ghl_appointment_match"."leadId" IS NULL AND "agency_os_ghl_appointment_match"."method" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "agency_os_ghl_appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrationMappingId" uuid NOT NULL,
	"calendarId" uuid NOT NULL,
	"contactId" uuid NOT NULL,
	"externalId" varchar(255) NOT NULL,
	"status" "agency_os_appointment_status" NOT NULL,
	"title" varchar(500),
	"startsAt" timestamp with time zone NOT NULL,
	"endsAt" timestamp with time zone NOT NULL,
	"providerCreatedAt" timestamp with time zone NOT NULL,
	"providerUpdatedAt" timestamp with time zone NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"rawPayload" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_ghl_calendar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrationMappingId" uuid NOT NULL,
	"externalId" varchar(255) NOT NULL,
	"name" varchar(500) NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ghl_calendar_id_mapping_unique" UNIQUE("id","integrationMappingId")
);
--> statement-breakpoint
ALTER TABLE "agency_os_ghl_appointment_match" ADD CONSTRAINT "agency_os_ghl_appointment_match_appointmentId_agency_os_ghl_appointment_id_fk" FOREIGN KEY ("appointmentId") REFERENCES "public"."agency_os_ghl_appointment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_appointment_match" ADD CONSTRAINT "agency_os_ghl_appointment_match_leadId_agency_os_lead_id_fk" FOREIGN KEY ("leadId") REFERENCES "public"."agency_os_lead"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_appointment" ADD CONSTRAINT "ghl_appointment_calendar_mapping_fk" FOREIGN KEY ("calendarId","integrationMappingId") REFERENCES "public"."agency_os_ghl_calendar"("id","integrationMappingId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_appointment" ADD CONSTRAINT "ghl_appointment_contact_mapping_fk" FOREIGN KEY ("contactId","integrationMappingId") REFERENCES "public"."agency_os_ghl_contact"("id","integrationMappingId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_calendar" ADD CONSTRAINT "agency_os_ghl_calendar_integrationMappingId_agency_os_integration_mapping_id_fk" FOREIGN KEY ("integrationMappingId") REFERENCES "public"."agency_os_integration_mapping"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ghl_appointment_match_lead_idx" ON "agency_os_ghl_appointment_match" USING btree ("leadId");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_appointment_mapping_external_idx" ON "agency_os_ghl_appointment" USING btree ("integrationMappingId","externalId");--> statement-breakpoint
CREATE INDEX "ghl_appointment_mapping_start_idx" ON "agency_os_ghl_appointment" USING btree ("integrationMappingId","startsAt");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_calendar_mapping_external_idx" ON "agency_os_ghl_calendar" USING btree ("integrationMappingId","externalId");