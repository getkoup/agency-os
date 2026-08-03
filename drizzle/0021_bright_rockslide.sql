CREATE TYPE "public"."agency_os_synchronization_mode" AS ENUM('fresh', 'full');--> statement-breakpoint
CREATE TYPE "public"."agency_os_synchronization_scope" AS ENUM('all', 'client');--> statement-breakpoint
CREATE TYPE "public"."agency_os_synchronization_trigger" AS ENUM('scheduled', 'manual', 'retry');--> statement-breakpoint
CREATE TABLE "agency_os_client_synchronization_state" (
	"clientId" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"lastAttemptAt" timestamp with time zone,
	"lastSucceededAt" timestamp with time zone,
	"lastFailedAt" timestamp with time zone,
	"lastErrorMessage" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_os_client_synchronization_state_clientId_provider_pk" PRIMARY KEY("clientId","provider"),
	CONSTRAINT "client_sync_state_provider" CHECK ("agency_os_client_synchronization_state"."provider" in ('ghl', 'windsor'))
);
--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_run" DROP CONSTRAINT "agency_os_all_client_sync_run_requestedByUserId_agency_os_user_id_fk";
--> statement-breakpoint
DROP INDEX "all_client_sync_one_running_idx";--> statement-breakpoint
DROP INDEX "all_client_sync_target_queue_idx";--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_run" ALTER COLUMN "requestedByUserId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_run" ADD COLUMN "requestedClientId" uuid;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_run" ADD COLUMN "mode" "agency_os_synchronization_mode" DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_run" ADD COLUMN "scope" "agency_os_synchronization_scope" DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_run" ADD COLUMN "trigger" "agency_os_synchronization_trigger" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_target" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_target" ADD COLUMN "leaseToken" uuid;--> statement-breakpoint
ALTER TABLE "agency_os_client_synchronization_state" ADD CONSTRAINT "agency_os_client_synchronization_state_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_sync_state_last_succeeded_idx" ON "agency_os_client_synchronization_state" USING btree ("lastSucceededAt");--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_run" ADD CONSTRAINT "agency_os_all_client_sync_run_requestedClientId_agency_os_client_id_fk" FOREIGN KEY ("requestedClientId") REFERENCES "public"."agency_os_client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_run" ADD CONSTRAINT "agency_os_all_client_sync_run_requestedByUserId_agency_os_user_id_fk" FOREIGN KEY ("requestedByUserId") REFERENCES "public"."agency_os_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "all_client_sync_run_status_started_idx" ON "agency_os_all_client_sync_run" USING btree ("status","startedAt");--> statement-breakpoint
CREATE INDEX "all_client_sync_run_requested_client_idx" ON "agency_os_all_client_sync_run" USING btree ("requestedClientId","startedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "all_client_sync_target_one_active_provider_idx" ON "agency_os_all_client_sync_target" USING btree ("clientId","provider") WHERE "agency_os_all_client_sync_target"."clientId" is not null and "agency_os_all_client_sync_target"."status" in ('pending', 'running');--> statement-breakpoint
CREATE INDEX "all_client_sync_target_queue_idx" ON "agency_os_all_client_sync_target" USING btree ("status","priority","availableAt");--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_target" ADD CONSTRAINT "all_client_sync_target_priority_nonnegative" CHECK ("agency_os_all_client_sync_target"."priority" >= 0);--> statement-breakpoint
INSERT INTO "agency_os_client_synchronization_state"
  ("clientId", "provider", "lastAttemptAt", "lastSucceededAt", "lastFailedAt", "createdAt", "updatedAt")
SELECT
  "clientId",
  "provider",
  max(coalesce("completedAt", "heartbeatAt", "startedAt")),
  max("completedAt") FILTER (WHERE "status" = 'succeeded'),
  max("completedAt") FILTER (WHERE "status" = 'failed'),
  now(),
  now()
FROM "agency_os_all_client_sync_target"
WHERE "clientId" IS NOT NULL
GROUP BY "clientId", "provider"
ON CONFLICT ("clientId", "provider") DO NOTHING;