CREATE TABLE "agency_os_ghl_client_configuration" (
	"clientId" uuid PRIMARY KEY NOT NULL,
	"locationId" varchar(255) NOT NULL,
	"encryptedToken" text NOT NULL,
	"tokenIv" varchar(255) NOT NULL,
	"tokenAuthTag" varchar(255) NOT NULL,
	"tokenLastFour" varchar(4) NOT NULL,
	"timezone" varchar(100) NOT NULL,
	"createdByUserId" varchar(255),
	"updatedByUserId" varchar(255),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ghl_client_configuration_encrypted_token_not_blank" CHECK (length("agency_os_ghl_client_configuration"."encryptedToken") > 0),
	CONSTRAINT "ghl_client_configuration_token_iv_not_blank" CHECK (length("agency_os_ghl_client_configuration"."tokenIv") > 0),
	CONSTRAINT "ghl_client_configuration_token_auth_tag_not_blank" CHECK (length("agency_os_ghl_client_configuration"."tokenAuthTag") > 0),
	CONSTRAINT "ghl_client_configuration_token_last_four_length" CHECK (length("agency_os_ghl_client_configuration"."tokenLastFour") = 4)
);
--> statement-breakpoint
ALTER TABLE "agency_os_ghl_client_configuration" ADD CONSTRAINT "agency_os_ghl_client_configuration_clientId_agency_os_client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."agency_os_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_client_configuration" ADD CONSTRAINT "agency_os_ghl_client_configuration_createdByUserId_agency_os_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."agency_os_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_os_ghl_client_configuration" ADD CONSTRAINT "agency_os_ghl_client_configuration_updatedByUserId_agency_os_user_id_fk" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."agency_os_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_client_configuration_location_idx" ON "agency_os_ghl_client_configuration" USING btree ("locationId");