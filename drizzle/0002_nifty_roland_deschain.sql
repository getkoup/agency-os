CREATE TYPE "public"."agency_os_all_client_sync_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agency_os_all_client_sync_target_status" AS ENUM('running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."agency_os_integration_provider" AS ENUM('ghl');--> statement-breakpoint
CREATE TYPE "public"."agency_os_opportunity_match_method" AS ENUM('email', 'phone', 'email_phone');--> statement-breakpoint
CREATE TYPE "public"."agency_os_opportunity_match_status" AS ENUM('matched', 'unmatched', 'ambiguous');--> statement-breakpoint
CREATE TABLE "agency_os_all_client_sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requestedByUserId" varchar(255) NOT NULL,
	"status" "agency_os_all_client_sync_status" DEFAULT 'running' NOT NULL,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeatAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone,
	"windsorSyncRunId" uuid,
	"discoveredAccountCount" integer DEFAULT 0 NOT NULL,
	"performanceRowCount" integer DEFAULT 0 NOT NULL,
	"leadRowCount" integer DEFAULT 0 NOT NULL,
	"contactRowCount" integer DEFAULT 0 NOT NULL,
	"opportunityRowCount" integer DEFAULT 0 NOT NULL,
	"matchedOpportunityCount" integer DEFAULT 0 NOT NULL,
	"errorMessage" text
);
--> statement-breakpoint
CREATE TABLE "agency_os_all_client_sync_target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runId" uuid NOT NULL,
	"clientId" uuid,
	"integrationMappingId" uuid,
	"clientSlug" varchar(100) NOT NULL,
	"clientName" varchar(255) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"status" "agency_os_all_client_sync_target_status" DEFAULT 'running' NOT NULL,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone,
	"sourceAccountCount" integer DEFAULT 0 NOT NULL,
	"performanceRowCount" integer DEFAULT 0 NOT NULL,
	"leadRowCount" integer DEFAULT 0 NOT NULL,
	"contactRowCount" integer DEFAULT 0 NOT NULL,
	"opportunityRowCount" integer DEFAULT 0 NOT NULL,
	"matchedOpportunityCount" integer DEFAULT 0 NOT NULL,
	"errorMessage" text
);
--> statement-breakpoint
CREATE TABLE "agency_os_ghl_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrationMappingId" uuid NOT NULL,
	"externalId" varchar(255) NOT NULL,
	"fullName" varchar(500),
	"email" varchar(500),
	"normalizedEmail" varchar(500),
	"phoneNumber" varchar(100),
	"normalizedPhone" varchar(100),
	"providerUpdatedAt" timestamp with time zone NOT NULL,
	"rawPayload" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ghl_contact_id_mapping_unique" UNIQUE("id","integrationMappingId")
);
--> statement-breakpoint
CREATE TABLE "agency_os_ghl_opportunity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integrationMappingId" uuid NOT NULL,
	"contactId" uuid NOT NULL,
	"externalId" varchar(255) NOT NULL,
	"status" varchar(50) NOT NULL,
	"name" varchar(500),
	"pipelineId" varchar(255),
	"pipelineStageId" varchar(255),
	"monetaryValue" numeric(14, 2),
	"currency" varchar(10),
	"wonAt" timestamp with time zone NOT NULL,
	"providerUpdatedAt" timestamp with time zone NOT NULL,
	"rawPayload" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_ghl_opportunity_match" (
	"opportunityId" uuid PRIMARY KEY NOT NULL,
	"leadId" uuid,
	"status" "agency_os_opportunity_match_status" NOT NULL,
	"method" "agency_os_opportunity_match_method",
	"candidateCount" integer NOT NULL,
	"matchedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ghl_opportunity_match_consistency" CHECK (("agency_os_ghl_opportunity_match"."status" = 'matched' AND "agency_os_ghl_opportunity_match"."leadId" IS NOT NULL AND "agency_os_ghl_opportunity_match"."method" IS NOT NULL AND "agency_os_ghl_opportunity_match"."candidateCount" = 1) OR ("agency_os_ghl_opportunity_match"."status" <> 'matched' AND "agency_os_ghl_opportunity_match"."leadId" IS NULL AND "agency_os_ghl_opportunity_match"."method" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "agency_os_integration_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"provider" "agency_os_integration_provider" NOT NULL,
	"externalLocationId" varchar(255) NOT NULL,
	"syncFromAt" timestamp with time zone NOT NULL,
	"lastSuccessfulSyncAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_run" ADD CONSTRAINT "agency_os_all_client_sync_run_requestedByUserId_agency_os_user_id_fk" FOREIGN KEY ("requestedByUserId") REFERENCES "public"."agency_os_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_run" ADD CONSTRAINT "agency_os_all_client_sync_run_windsorSyncRunId_agency_os_sync_run_id_fk" FOREIGN KEY ("windsorSyncRunId") REFERENCES "public"."agency_os_sync_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_target" ADD CONSTRAINT "agency_os_all_client_sync_target_runId_agency_os_all_client_sync_run_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."agency_os_all_client_sync_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_target" ADD CONSTRAINT "agency_os_all_client_sync_target_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_target" ADD CONSTRAINT "agency_os_all_client_sync_target_integrationMappingId_agency_os_integration_mapping_id_fk" FOREIGN KEY ("integrationMappingId") REFERENCES "public"."agency_os_integration_mapping"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_contact" ADD CONSTRAINT "agency_os_ghl_contact_integrationMappingId_agency_os_integration_mapping_id_fk" FOREIGN KEY ("integrationMappingId") REFERENCES "public"."agency_os_integration_mapping"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_opportunity" ADD CONSTRAINT "ghl_opportunity_contact_mapping_fk" FOREIGN KEY ("contactId","integrationMappingId") REFERENCES "public"."agency_os_ghl_contact"("id","integrationMappingId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_opportunity_match" ADD CONSTRAINT "agency_os_ghl_opportunity_match_opportunityId_agency_os_ghl_opportunity_id_fk" FOREIGN KEY ("opportunityId") REFERENCES "public"."agency_os_ghl_opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_opportunity_match" ADD CONSTRAINT "agency_os_ghl_opportunity_match_leadId_agency_os_lead_id_fk" FOREIGN KEY ("leadId") REFERENCES "public"."agency_os_lead"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_integration_mapping" ADD CONSTRAINT "agency_os_integration_mapping_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "all_client_sync_one_running_idx" ON "agency_os_all_client_sync_run" USING btree ("status") WHERE "agency_os_all_client_sync_run"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "all_client_sync_target_run_slug_provider_idx" ON "agency_os_all_client_sync_target" USING btree ("runId","clientSlug","provider");--> statement-breakpoint
CREATE INDEX "all_client_sync_target_run_idx" ON "agency_os_all_client_sync_target" USING btree ("runId");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_contact_mapping_external_idx" ON "agency_os_ghl_contact" USING btree ("integrationMappingId","externalId");--> statement-breakpoint
CREATE INDEX "ghl_contact_mapping_email_idx" ON "agency_os_ghl_contact" USING btree ("integrationMappingId","normalizedEmail");--> statement-breakpoint
CREATE INDEX "ghl_contact_mapping_phone_idx" ON "agency_os_ghl_contact" USING btree ("integrationMappingId","normalizedPhone");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_opportunity_mapping_external_idx" ON "agency_os_ghl_opportunity" USING btree ("integrationMappingId","externalId");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_opportunity_id_mapping_idx" ON "agency_os_ghl_opportunity" USING btree ("id","integrationMappingId");--> statement-breakpoint
CREATE INDEX "ghl_opportunity_mapping_won_idx" ON "agency_os_ghl_opportunity" USING btree ("integrationMappingId","wonAt");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_mapping_client_provider_idx" ON "agency_os_integration_mapping" USING btree ("clientId","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_mapping_provider_location_idx" ON "agency_os_integration_mapping" USING btree ("provider","externalLocationId");--> statement-breakpoint