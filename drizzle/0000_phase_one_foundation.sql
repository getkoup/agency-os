CREATE TYPE "public"."agency_os_record_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."agency_os_source_account_status" AS ENUM('active', 'disconnected', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."agency_os_sync_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agency_os_user_role" AS ENUM('agency_admin', 'client_viewer');--> statement-breakpoint
CREATE TABLE "agency_os_account" (
	"userId" varchar(255) NOT NULL,
	"type" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"providerAccountId" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" varchar(255),
	"scope" varchar(255),
	"id_token" text,
	"session_state" varchar(255),
	CONSTRAINT "agency_os_account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "agency_os_ad_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaignId" uuid NOT NULL,
	"externalId" varchar(255) NOT NULL,
	"name" varchar(500) NOT NULL,
	"status" varchar(100),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_ad_performance_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sourceAccountId" uuid NOT NULL,
	"campaignId" uuid NOT NULL,
	"adGroupId" uuid NOT NULL,
	"adId" uuid NOT NULL,
	"date" date NOT NULL,
	"currency" varchar(10),
	"spend" numeric(14, 2),
	"impressions" bigint,
	"reach" bigint,
	"clicks" bigint,
	"linkClicks" bigint,
	"engagements" bigint,
	"conversions" bigint,
	"leads" bigint,
	"messagingConversations" bigint,
	"messagingConnections" bigint,
	"cpc" numeric(14, 2),
	"ctr" numeric(14, 2),
	"providerMetrics" jsonb NOT NULL,
	"rawPayload" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_ad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adGroupId" uuid NOT NULL,
	"externalId" varchar(255) NOT NULL,
	"name" varchar(500) NOT NULL,
	"status" varchar(100),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sourceAccountId" uuid NOT NULL,
	"externalId" varchar(255) NOT NULL,
	"name" varchar(500) NOT NULL,
	"objective" varchar(255),
	"status" varchar(100),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_client_membership" (
	"userId" varchar(255) NOT NULL,
	"clientId" uuid NOT NULL,
	CONSTRAINT "agency_os_client_membership_userId_clientId_pk" PRIMARY KEY("userId","clientId")
);
--> statement-breakpoint
CREATE TABLE "agency_os_client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "agency_os_record_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_lead_form" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sourceAccountId" uuid NOT NULL,
	"externalId" varchar(255) NOT NULL,
	"name" varchar(500),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sourceAccountId" uuid NOT NULL,
	"externalId" varchar(255) NOT NULL,
	"campaignId" uuid,
	"adGroupId" uuid,
	"adId" uuid,
	"leadFormId" uuid,
	"occurredAt" timestamp with time zone NOT NULL,
	"fullName" varchar(500),
	"email" varchar(500),
	"phoneNumber" varchar(100),
	"rawPayload" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_session" (
	"sessionToken" varchar(255) PRIMARY KEY NOT NULL,
	"userId" varchar(255) NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_os_source_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid,
	"dataProvider" varchar(50) NOT NULL,
	"platform" varchar(50) NOT NULL,
	"connector" varchar(50) NOT NULL,
	"connectorAccountId" varchar(255) NOT NULL,
	"externalAccountId" varchar(255) NOT NULL,
	"externalAccountName" varchar(255) NOT NULL,
	"normalizedName" varchar(255) NOT NULL,
	"status" "agency_os_source_account_status" DEFAULT 'active' NOT NULL,
	"firstSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSyncedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agency_os_sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataProvider" varchar(50) NOT NULL,
	"status" "agency_os_sync_status" DEFAULT 'running' NOT NULL,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone,
	"discoveredAccountCount" integer DEFAULT 0 NOT NULL,
	"performanceRowCount" integer DEFAULT 0 NOT NULL,
	"leadRowCount" integer DEFAULT 0 NOT NULL,
	"errorMessage" text
);
--> statement-breakpoint
CREATE TABLE "agency_os_user" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"email" varchar(255) NOT NULL,
	"emailVerified" timestamp with time zone,
	"image" varchar(255),
	"role" "agency_os_user_role" DEFAULT 'client_viewer' NOT NULL,
	"passwordHash" text
);
--> statement-breakpoint
CREATE TABLE "agency_os_verification_token" (
	"identifier" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "agency_os_verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "agency_os_account" ADD CONSTRAINT "agency_os_account_userId_agency_os_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."agency_os_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ad_group" ADD CONSTRAINT "agency_os_ad_group_campaignId_agency_os_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."agency_os_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ad_performance_daily" ADD CONSTRAINT "agency_os_ad_performance_daily_sourceAccountId_agency_os_source_account_id_fk" FOREIGN KEY ("sourceAccountId") REFERENCES "public"."agency_os_source_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ad_performance_daily" ADD CONSTRAINT "agency_os_ad_performance_daily_campaignId_agency_os_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."agency_os_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ad_performance_daily" ADD CONSTRAINT "agency_os_ad_performance_daily_adGroupId_agency_os_ad_group_id_fk" FOREIGN KEY ("adGroupId") REFERENCES "public"."agency_os_ad_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ad_performance_daily" ADD CONSTRAINT "agency_os_ad_performance_daily_adId_agency_os_ad_id_fk" FOREIGN KEY ("adId") REFERENCES "public"."agency_os_ad"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ad" ADD CONSTRAINT "agency_os_ad_adGroupId_agency_os_ad_group_id_fk" FOREIGN KEY ("adGroupId") REFERENCES "public"."agency_os_ad_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_campaign" ADD CONSTRAINT "agency_os_campaign_sourceAccountId_agency_os_source_account_id_fk" FOREIGN KEY ("sourceAccountId") REFERENCES "public"."agency_os_source_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_client_membership" ADD CONSTRAINT "agency_os_client_membership_userId_agency_os_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."agency_os_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_client_membership" ADD CONSTRAINT "agency_os_client_membership_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_lead_form" ADD CONSTRAINT "agency_os_lead_form_sourceAccountId_agency_os_source_account_id_fk" FOREIGN KEY ("sourceAccountId") REFERENCES "public"."agency_os_source_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_lead" ADD CONSTRAINT "agency_os_lead_sourceAccountId_agency_os_source_account_id_fk" FOREIGN KEY ("sourceAccountId") REFERENCES "public"."agency_os_source_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_lead" ADD CONSTRAINT "agency_os_lead_campaignId_agency_os_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."agency_os_campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_lead" ADD CONSTRAINT "agency_os_lead_adGroupId_agency_os_ad_group_id_fk" FOREIGN KEY ("adGroupId") REFERENCES "public"."agency_os_ad_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_lead" ADD CONSTRAINT "agency_os_lead_adId_agency_os_ad_id_fk" FOREIGN KEY ("adId") REFERENCES "public"."agency_os_ad"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_lead" ADD CONSTRAINT "agency_os_lead_leadFormId_agency_os_lead_form_id_fk" FOREIGN KEY ("leadFormId") REFERENCES "public"."agency_os_lead_form"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_session" ADD CONSTRAINT "agency_os_session_userId_agency_os_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."agency_os_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_source_account" ADD CONSTRAINT "agency_os_source_account_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "agency_os_account" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_group_campaign_external_idx" ON "agency_os_ad_group" USING btree ("campaignId","externalId");--> statement-breakpoint
CREATE INDEX "ad_group_campaign_idx" ON "agency_os_ad_group" USING btree ("campaignId");--> statement-breakpoint
CREATE UNIQUE INDEX "performance_ad_date_idx" ON "agency_os_ad_performance_daily" USING btree ("adId","date");--> statement-breakpoint
CREATE INDEX "performance_source_date_idx" ON "agency_os_ad_performance_daily" USING btree ("sourceAccountId","date");--> statement-breakpoint
CREATE INDEX "performance_campaign_idx" ON "agency_os_ad_performance_daily" USING btree ("campaignId");--> statement-breakpoint
CREATE INDEX "performance_ad_group_idx" ON "agency_os_ad_performance_daily" USING btree ("adGroupId");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_group_external_idx" ON "agency_os_ad" USING btree ("adGroupId","externalId");--> statement-breakpoint
CREATE INDEX "ad_ad_group_idx" ON "agency_os_ad" USING btree ("adGroupId");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_source_external_idx" ON "agency_os_campaign" USING btree ("sourceAccountId","externalId");--> statement-breakpoint
CREATE INDEX "campaign_source_idx" ON "agency_os_campaign" USING btree ("sourceAccountId");--> statement-breakpoint
CREATE INDEX "membership_client_idx" ON "agency_os_client_membership" USING btree ("clientId");--> statement-breakpoint
CREATE UNIQUE INDEX "client_slug_idx" ON "agency_os_client" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_form_source_external_idx" ON "agency_os_lead_form" USING btree ("sourceAccountId","externalId");--> statement-breakpoint
CREATE INDEX "lead_form_source_idx" ON "agency_os_lead_form" USING btree ("sourceAccountId");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_source_external_idx" ON "agency_os_lead" USING btree ("sourceAccountId","externalId");--> statement-breakpoint
CREATE INDEX "lead_source_occurred_idx" ON "agency_os_lead" USING btree ("sourceAccountId","occurredAt");--> statement-breakpoint
CREATE INDEX "lead_campaign_idx" ON "agency_os_lead" USING btree ("campaignId");--> statement-breakpoint
CREATE INDEX "lead_ad_group_idx" ON "agency_os_lead" USING btree ("adGroupId");--> statement-breakpoint
CREATE INDEX "lead_ad_idx" ON "agency_os_lead" USING btree ("adId");--> statement-breakpoint
CREATE INDEX "lead_form_idx" ON "agency_os_lead" USING btree ("leadFormId");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "agency_os_session" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "source_provider_connector_external_idx" ON "agency_os_source_account" USING btree ("dataProvider","connector","externalAccountId");--> statement-breakpoint
CREATE UNIQUE INDEX "source_provider_connector_account_idx" ON "agency_os_source_account" USING btree ("dataProvider","connectorAccountId");--> statement-breakpoint
CREATE INDEX "source_client_idx" ON "agency_os_source_account" USING btree ("clientId");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_lower_idx" ON "agency_os_user" USING btree (lower("email"));