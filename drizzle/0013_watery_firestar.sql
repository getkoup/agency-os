ALTER TYPE "public"."agency_os_all_client_sync_target_status" ADD VALUE 'pending' BEFORE 'running';--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_target" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_target" ADD COLUMN "heartbeatAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_target" ADD COLUMN "availableAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_target" ADD COLUMN "leaseExpiresAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_target" ADD COLUMN "failureCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_target" ADD COLUMN "checkpoint" jsonb;--> statement-breakpoint
CREATE INDEX "all_client_sync_target_queue_idx" ON "agency_os_all_client_sync_target" USING btree ("status","availableAt");--> statement-breakpoint
ALTER TABLE "agency_os_all_client_sync_target" ADD CONSTRAINT "all_client_sync_target_failure_count_nonnegative" CHECK ("agency_os_all_client_sync_target"."failureCount" >= 0);