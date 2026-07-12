CREATE TYPE "public"."agency_os_user_role_next" AS ENUM('owner', 'admin', 'client');--> statement-breakpoint
ALTER TABLE "agency_os_user" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "agency_os_user" ALTER COLUMN "role" TYPE "agency_os_user_role_next" USING (CASE "role"::text WHEN 'agency_admin' THEN 'owner' WHEN 'client_viewer' THEN 'client' ELSE "role"::text END)::"agency_os_user_role_next";--> statement-breakpoint
DROP TYPE "public"."agency_os_user_role";--> statement-breakpoint
ALTER TYPE "public"."agency_os_user_role_next" RENAME TO "agency_os_user_role";--> statement-breakpoint
ALTER TABLE "agency_os_user" ALTER COLUMN "role" SET DEFAULT 'client'::"agency_os_user_role";--> statement-breakpoint
ALTER TABLE "agency_os_user" ADD COLUMN "status" "agency_os_record_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "client_name_lower_idx" ON "agency_os_client" USING btree (lower("name"));
