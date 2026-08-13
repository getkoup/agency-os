import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("MIGRATION_TEST_DATABASE_URL is required");
const url = new URL(databaseUrl);
if (url.pathname !== "/agency_os_migration_test") {
  throw new Error(
    "MIGRATION_TEST_DATABASE_URL must target agency_os_migration_test",
  );
}
const serverUrl = new URL(url);
serverUrl.pathname = "/postgres";
const admin = postgres(serverUrl.toString(), { max: 1 });
let test: ReturnType<typeof postgres> | null = null;

async function applyMigration(
  sqlClient: ReturnType<typeof postgres>,
  path: string,
) {
  const source = await readFile(path, "utf8");
  await sqlClient.begin(async (transaction) => {
    for (const statement of source.split("--> statement-breakpoint")) {
      if (statement.trim()) await transaction.unsafe(statement);
    }
  });
}

async function expectConstraintViolation(
  operation: () => Promise<unknown>,
  label: string,
) {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(`${label} constraint was not enforced`);
}

try {
  await admin.unsafe(
    'drop database if exists "agency_os_migration_test" with (force)',
  );
  await admin.unsafe('create database "agency_os_migration_test"');
  test = postgres(databaseUrl, { max: 1 });
  await applyMigration(test, "drizzle/0000_phase_one_foundation.sql");
  await test`
    insert into "agency_os_user" ("id", "email", "role") values
      ('legacy-owner', 'legacy-owner@example.com', 'agency_admin'),
      ('legacy-client', 'legacy-client@example.com', 'client_viewer')
  `;
  await applyMigration(test, "drizzle/0001_proper_dashboard_rbac.sql");
  await applyMigration(test, "drizzle/0002_nifty_roland_deschain.sql");
  await applyMigration(test, "drizzle/0003_glamorous_vulture.sql");
  await applyMigration(test, "drizzle/0004_mute_northstar.sql");
  await applyMigration(test, "drizzle/0005_use-opportunity-created-at.sql");
  await test`
    insert into "agency_os_client" ("slug", "name")
    values ('tint-lab', 'Tint Lab')
  `;
  await applyMigration(test, "drizzle/0006_tranquil_alex_wilder.sql");
  await applyMigration(test, "drizzle/0007_campaign_daily_tracker.sql");
  await applyMigration(
    test,
    "drizzle/0008_encrypted_ghl_client_configuration.sql",
  );
  const [backfillClient] =
    await test`select "id" from "agency_os_client" where "slug" = 'tint-lab'`;
  if (!backfillClient) throw new Error("Backfill migration client is missing");
  await test`
    insert into "agency_os_integration_mapping"
      ("clientId", "provider", "externalLocationId", "syncFromAt",
       "lastSuccessfulSyncAt")
    values (${backfillClient.id}, 'ghl', 'backfill-location', now(), now())
  `;
  await applyMigration(test, "drizzle/0009_motionless_ben_parker.sql");
  await applyMigration(test, "drizzle/0010_overconfident_apocalypse.sql");
  await applyMigration(test, "drizzle/0011_nebulous_red_wolf.sql");
  await applyMigration(test, "drizzle/0012_woozy_karnak.sql");
  await applyMigration(test, "drizzle/0013_watery_firestar.sql");
  await applyMigration(test, "drizzle/0014_complex_spencer_smythe.sql");
  await applyMigration(test, "drizzle/0015_bright_praxagora.sql");
  await test`
    insert into "agency_os_salesperson"
      ("clientId", "externalUserId", "displayName", "nameIsPlaceholder")
    values
      (${backfillClient.id}, 'placeholder-user', 'GHL user placeholder', true),
      (${backfillClient.id}, 'custom-user', 'Custom display name', false)
  `;
  await applyMigration(test, "drizzle/0016_typical_moira_mactaggert.sql");
  await applyMigration(test, "drizzle/0017_worthless_gamora.sql");
  const migratedSalespersonNames = await test`
    select "externalUserId", "displayName", "providerName"
    from "agency_os_salesperson"
    order by "externalUserId"
  `;
  if (
    JSON.stringify(migratedSalespersonNames) !==
    JSON.stringify([
      {
        externalUserId: "custom-user",
        displayName: "Custom display name",
        providerName: null,
      },
      {
        externalUserId: "placeholder-user",
        displayName: null,
        providerName: null,
      },
    ])
  ) {
    throw new Error("Salesperson display-name migration is incorrect");
  }
  const [secondSalesClient] = await test`
    insert into "agency_os_client" ("slug", "name")
    values ('second-sales-client', 'Second Sales Client')
    returning "id"
  `;
  if (!secondSalesClient) throw new Error("Second sales client is missing");
  await test`
    insert into "agency_os_salesperson"
      ("clientId", "externalUserId", "providerName")
    values (${secondSalesClient.id}, 'placeholder-user', 'Shared User')
  `;
  await applyMigration(test, "drizzle/0018_polite_bloodstorm.sql");
  await applyMigration(test, "drizzle/0019_smart_sugar_man.sql");
  await applyMigration(test, "drizzle/0020_far_changeling.sql");
  const [legacySyncRun] = await test`
    insert into "agency_os_all_client_sync_run"
      ("requestedByUserId", "status", "completedAt")
    values ('legacy-owner', 'succeeded', now())
    returning "id"
  `;
  if (!legacySyncRun) throw new Error("Legacy sync run was not created");
  await test`
    insert into "agency_os_all_client_sync_target"
      ("runId", "clientId", "clientSlug", "clientName", "provider",
       "status", "completedAt")
    values
      (${legacySyncRun.id}, ${backfillClient.id}, 'tint-lab', 'Tint Lab',
       'ghl', 'succeeded', now())
  `;
  await applyMigration(test, "drizzle/0021_bright_rockslide.sql");
  const [backfilledSyncState] = await test`
    select "lastSucceededAt"
    from "agency_os_client_synchronization_state"
    where "clientId" = ${backfillClient.id} and "provider" = 'ghl'
  `;
  if (!backfilledSyncState?.lastSucceededAt) {
    throw new Error("Client synchronization state was not backfilled");
  }
  await applyMigration(test, "drizzle/0022_majestic_lady_ursula.sql");
  await applyMigration(test, "drizzle/0023_complete_dragon_man.sql");
  const [v2BackfillCategory] = await test`
    insert into "agency_os_sales_commission_v2_category"
      ("clientId", "name", "normalizedName")
    values (${backfillClient.id}, 'Ceramic Coating', 'ceramic coating')
    returning "id"
  `;
  const [v2SecondCategory] = await test`
    insert into "agency_os_sales_commission_v2_category"
      ("clientId", "name", "normalizedName")
    values (${secondSalesClient.id}, 'Tint and detail', 'tint and detail')
    returning "id"
  `;
  if (!v2BackfillCategory || !v2SecondCategory) {
    throw new Error("V2 sales categories were not created");
  }
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_sales_commission_v2_category"
          ("clientId", "name", "normalizedName")
        values (${backfillClient.id}, 'Duplicate', 'ceramic coating')
      `,
    "V2 normalized category uniqueness",
  );
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_sales_commission_v2_category"
          ("clientId", "name", "normalizedName")
        values (${backfillClient.id}, 'Blank', '   ')
      `,
    "V2 non-blank normalized category",
  );
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_sales_commission_v2_category"
          ("clientId", "name", "normalizedName", "sortOrder")
        values (${backfillClient.id}, 'Negative', 'negative', -1)
      `,
    "V2 non-negative category sort order",
  );
  await test`
    insert into "agency_os_sales_commission_v2_mapping_rule"
      ("clientId", "categoryId", "name", "field", "keywords", "priority")
    values (
      ${backfillClient.id},
      ${v2BackfillCategory.id},
      'Ceramic abbreviation',
      'category',
      array['cc'],
      100
    )
  `;
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_sales_commission_v2_mapping_rule"
          ("clientId", "categoryId", "name", "field", "keywords")
        values (
          ${backfillClient.id},
          ${v2BackfillCategory.id},
          'Empty',
          'category',
          array[]::text[]
        )
      `,
    "V2 non-empty mapping keywords",
  );
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_sales_commission_v2_mapping_rule"
          ("clientId", "categoryId", "name", "field", "keywords", "priority")
        values (
          ${backfillClient.id},
          ${v2BackfillCategory.id},
          'Negative',
          'category',
          array['negative'],
          -1
        )
      `,
    "V2 non-negative mapping priority",
  );
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_sales_commission_v2_mapping_rule"
          ("clientId", "categoryId", "name", "field", "keywords")
        values (
          ${secondSalesClient.id},
          ${v2BackfillCategory.id},
          'Cross-client rule',
          'service',
          array['ceramic']
        )
      `,
    "V2 cross-client mapping rule",
  );
  await test`
    insert into "agency_os_salesperson_commission_v2_rate"
      ("clientId", "salespersonExternalUserId", "categoryId", "commissionValue")
    values (
      ${backfillClient.id},
      'placeholder-user',
      ${v2BackfillCategory.id},
      30
    )
  `;
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_salesperson_commission_v2_rate"
          ("clientId", "salespersonExternalUserId", "categoryId",
           "commissionValue")
        values (
          ${backfillClient.id},
          'placeholder-user',
          ${v2BackfillCategory.id},
          20
        )
      `,
    "V2 commission rate uniqueness",
  );
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_salesperson_commission_v2_rate"
          ("clientId", "salespersonExternalUserId", "categoryId",
           "commissionValue")
        values (
          ${backfillClient.id},
          'placeholder-user',
          ${v2BackfillCategory.id},
          -0.01
        )
      `,
    "V2 non-negative commission rate",
  );
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_salesperson_commission_v2_rate"
          ("clientId", "salespersonExternalUserId", "categoryId",
           "commissionValue")
        values (
          ${secondSalesClient.id},
          'custom-user',
          ${v2SecondCategory.id},
          20
        )
      `,
    "V2 cross-client salesperson rate",
  );
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_salesperson_commission_v2_rate"
          ("clientId", "salespersonExternalUserId", "categoryId",
           "commissionValue")
        values (
          ${backfillClient.id},
          'placeholder-user',
          ${v2SecondCategory.id},
          20
        )
      `,
    "V2 cross-client category rate",
  );
  const [v2CascadeClient] = await test`
    insert into "agency_os_client" ("slug", "name")
    values ('v2-cascade-client', 'V2 Cascade Client')
    returning "id"
  `;
  if (!v2CascadeClient) throw new Error("V2 cascade client was not created");
  await test`
    insert into "agency_os_salesperson"
      ("clientId", "externalUserId", "providerName")
    values (${v2CascadeClient.id}, 'v2-cascade-user', 'V2 Cascade User')
  `;
  const [v2CascadeCategory] = await test`
    insert into "agency_os_sales_commission_v2_category"
      ("clientId", "name", "normalizedName")
    values (${v2CascadeClient.id}, 'Cascade', 'cascade')
    returning "id"
  `;
  if (!v2CascadeCategory)
    throw new Error("V2 cascade category was not created");
  await test`
    insert into "agency_os_sales_commission_v2_setting" ("clientId")
    values (${v2CascadeClient.id})
  `;
  await test`
    insert into "agency_os_sales_commission_v2_mapping_rule"
      ("clientId", "categoryId", "name", "field", "keywords")
    values (
      ${v2CascadeClient.id},
      ${v2CascadeCategory.id},
      'Cascade',
      'category',
      array['cascade']
    )
  `;
  await test`
    insert into "agency_os_salesperson_commission_v2_rate"
      ("clientId", "salespersonExternalUserId", "categoryId", "commissionValue")
    values (
      ${v2CascadeClient.id},
      'v2-cascade-user',
      ${v2CascadeCategory.id},
      1
    )
  `;
  await test`
    delete from "agency_os_client" where "id" = ${v2CascadeClient.id}
  `;
  const [v2CascadeCounts] = await test`
    select
      (select count(*)::int
       from "agency_os_sales_commission_v2_setting"
       where "clientId" = ${v2CascadeClient.id}) "settings",
      (select count(*)::int
       from "agency_os_sales_commission_v2_category"
       where "clientId" = ${v2CascadeClient.id}) "categories",
      (select count(*)::int
       from "agency_os_sales_commission_v2_mapping_rule"
       where "clientId" = ${v2CascadeClient.id}) "rules",
      (select count(*)::int
       from "agency_os_salesperson_commission_v2_rate"
       where "clientId" = ${v2CascadeClient.id}) "rates"
  `;
  if (
    !v2CascadeCounts ||
    Object.values(v2CascadeCounts).some((count) => count !== 0)
  ) {
    throw new Error("V2 client configuration did not cascade delete");
  }
  const [agencySetting] = await test`
    select "id", "reportingTimezone", "campaignCplWarningThreshold",
      "campaignCplCriticalThreshold"
    from "agency_os_setting"
  `;
  if (
    !agencySetting ||
    agencySetting.id !== 1 ||
    agencySetting.reportingTimezone !== "UTC" ||
    agencySetting.campaignCplWarningThreshold !== "15.00" ||
    agencySetting.campaignCplCriticalThreshold !== "25.00"
  ) {
    throw new Error("Agency settings defaults were not seeded correctly");
  }
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_setting" ("id", "reportingTimezone")
        values (2, 'UTC')
      `,
    "agency setting singleton",
  );
  await expectConstraintViolation(
    () =>
      test!`
        update "agency_os_setting"
        set "reportingTimezone" = '   '
        where "id" = 1
      `,
    "non-blank reporting timezone",
  );
  await expectConstraintViolation(
    () =>
      test!`
        update "agency_os_setting"
        set "campaignCplWarningThreshold" = -0.01
        where "id" = 1
      `,
    "non-negative campaign CPL warning threshold",
  );
  await expectConstraintViolation(
    () =>
      test!`
        update "agency_os_setting"
        set "campaignCplCriticalThreshold" = "campaignCplWarningThreshold"
        where "id" = 1
      `,
    "campaign CPL critical threshold ordering",
  );
  const globalSalespersonBackfill = await test`
    select i."externalUserId",
      count(distinct i."globalSalespersonId")::int "globalCount",
      count(s.id)::int "assignmentCount"
    from "agency_os_global_salesperson_identity" i
    join "agency_os_salesperson" s on s."externalUserId" = i."externalUserId"
    where i.provider = 'ghl'
    group by i."externalUserId"
    order by i."externalUserId"
  `;
  if (
    JSON.stringify(globalSalespersonBackfill) !==
    JSON.stringify([
      {
        externalUserId: "custom-user",
        globalCount: 1,
        assignmentCount: 1,
      },
      {
        externalUserId: "placeholder-user",
        globalCount: 1,
        assignmentCount: 2,
      },
    ])
  ) {
    throw new Error("Global salesperson identity backfill is incorrect");
  }
  const invalidGlobalSalespersonIds = await test`
    select "id"
    from "agency_os_global_salesperson"
    where "id"::text !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  `;
  if (invalidGlobalSalespersonIds.length) {
    throw new Error("Global salesperson backfill produced invalid UUIDs");
  }
  const [backfillMapping] = await test`
    select "lastSuccessfulSyncAt"
    from "agency_os_integration_mapping"
    where "externalLocationId" = 'backfill-location'
  `;
  if (!backfillMapping || backfillMapping.lastSuccessfulSyncAt !== null) {
    throw new Error("GHL source migration did not request a full backfill");
  }
  const seededClassificationRules = await test`
    select "categoryName", "keywords", "matchMode", "priority"
    from "agency_os_lead_classification_rule"
    order by "priority" desc
  `;
  if (
    JSON.stringify(seededClassificationRules) !==
    JSON.stringify([
      {
        categoryName: "Tint",
        keywords: ["tint"],
        matchMode: "any",
        priority: 100,
      },
      {
        categoryName: "PPF",
        keywords: ["ppf", "paint protection film"],
        matchMode: "any",
        priority: 90,
      },
      {
        categoryName: "Ceramic Coating",
        keywords: ["coating", "ceramic"],
        matchMode: "any",
        priority: 80,
      },
    ])
  ) {
    throw new Error("Tint Lab lead classification defaults are incorrect");
  }
  const rows =
    await test`select "id", "email", "role", "status" from "agency_os_user" order by "id"`;
  const enumRows = await test`
    select e.enumlabel as value
    from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'agency_os_user_role'
    order by e.enumsortorder
  `;
  const defaults = await test`
    select column_name, column_default
    from information_schema.columns
    where table_name = 'agency_os_user' and column_name in ('role', 'status')
  `;
  const expectedRows = [
    {
      id: "legacy-client",
      email: "legacy-client@example.com",
      role: "client",
      status: "active",
    },
    {
      id: "legacy-owner",
      email: "legacy-owner@example.com",
      role: "owner",
      status: "active",
    },
  ];
  if (JSON.stringify(rows) !== JSON.stringify(expectedRows))
    throw new Error(
      "Legacy user migration changed identity or mapped roles incorrectly",
    );
  if (
    JSON.stringify(enumRows.map(({ value }) => value)) !==
    JSON.stringify(["owner", "admin", "manager", "client"])
  )
    throw new Error("Role enum values are incorrect");
  const byColumn = new Map(
    defaults.map(({ column_name, column_default }) => [
      column_name,
      column_default,
    ]),
  );
  if (!String(byColumn.get("role")).includes("'client'"))
    throw new Error("Role default is not client");
  if (!String(byColumn.get("status")).includes("'active'"))
    throw new Error("Status default is not active");
  const [client] = await test`
    insert into "agency_os_client" ("slug", "name")
    values ('migration-client', 'Migration Client')
    returning "id"
  `;
  if (!client) throw new Error("Migration client was not created");
  const [mapping] = await test`
    insert into "agency_os_integration_mapping"
      ("clientId", "provider", "externalLocationId", "syncFromAt")
    values (${client.id}, 'ghl', 'migration-location', now())
    returning "id", "timezone"
  `;
  if (!mapping) throw new Error("Integration mapping was not created");
  if (mapping.timezone !== "UTC") {
    throw new Error("Integration mapping timezone does not default to UTC");
  }
  const [contact] = await test`
    insert into "agency_os_ghl_contact"
      ("integrationMappingId", "externalId", "providerUpdatedAt", "rawPayload")
    values (${mapping.id}, 'migration-contact', now(), '{}')
    returning "id", "tags"
  `;
  if (!contact || contact.tags.length !== 0) {
    throw new Error("GHL contact tags do not default to an empty array");
  }
  const [opportunity] = await test`
    insert into "agency_os_ghl_opportunity"
      ("integrationMappingId", "contactId", "externalId", "status", "source",
       "wonAt", "providerUpdatedAt", "rawPayload")
    values (${mapping.id}, ${contact.id}, 'migration-opportunity', 'won',
      'Facebook', now(), now(), '{}')
    returning "source", "tags"
  `;
  if (!opportunity || opportunity.tags.length !== 0) {
    throw new Error("GHL opportunity tags do not default to an empty array");
  }
  if (opportunity.source !== "Facebook") {
    throw new Error("GHL opportunity source was not stored");
  }
  await test`
    insert into "agency_os_revenue_rule"
      ("clientId", "tagName", "revenueValue")
    values (${client.id}, 'Qualified', 125.50)
  `;
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_revenue_rule"
          ("clientId", "tagName", "revenueValue")
        values (${client.id}, 'qualified', 200)
      `,
    "case-insensitive revenue rule uniqueness",
  );
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_revenue_rule"
          ("clientId", "tagName", "revenueValue")
        values (${client.id}, 'Invalid', -0.01)
      `,
    "non-negative revenue value",
  );
  await test`
    insert into "agency_os_lead_classification_rule"
      ("clientId", "categoryName", "keywords", "priority")
    values (${client.id}, 'Detailing', array['detailing'], 70)
  `;
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_lead_classification_rule"
          ("clientId", "categoryName", "keywords", "priority")
        values (${client.id}, 'detailing', array['detail'], 60)
      `,
    "case-insensitive lead category uniqueness",
  );
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_lead_classification_rule"
          ("clientId", "categoryName", "keywords", "priority")
        values (${client.id}, 'Empty', array[]::text[], 50)
      `,
    "non-empty lead category keywords",
  );
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_lead_classification_rule"
          ("clientId", "categoryName", "keywords", "priority")
        values (${client.id}, 'Negative', array['negative'], -1)
      `,
    "non-negative lead category priority",
  );
  const [salesCategory] = await test`
    insert into "agency_os_sales_category" ("clientId", "name")
    values (${client.id}, 'Ceramic')
    returning "id"
  `;
  if (!salesCategory) throw new Error("Sales category was not created");
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_sales_category" ("clientId", "name")
        values (${client.id}, 'ceramic')
      `,
    "case-insensitive sales category uniqueness",
  );
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_sales_offer"
          ("clientId", "categoryId", "name", "keywords", "revenueValue")
        values (${client.id}, ${salesCategory.id}, 'Invalid', array[]::text[], 299)
      `,
    "non-empty sales offer keywords",
  );
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_integration_mapping"
          ("clientId", "provider", "externalLocationId", "syncFromAt")
        values (${client.id}, 'ghl', 'other-location', now())
      `,
    "one provider mapping per client",
  );
  const [firstSyncRun] = await test`
    insert into "agency_os_all_client_sync_run" ("requestedByUserId")
    values ('legacy-owner')
    returning "id"
  `;
  const [secondSyncRun] = await test`
    insert into "agency_os_all_client_sync_run" ("requestedByUserId")
    values ('legacy-owner')
    returning "id"
  `;
  if (!firstSyncRun || !secondSyncRun) {
    throw new Error("Synchronization runs were not created");
  }
  await test`
    insert into "agency_os_all_client_sync_target"
      ("runId", "clientId", "clientSlug", "clientName", "provider")
    values
      (${firstSyncRun.id}, ${client.id}, 'legacy-client', 'Legacy Client', 'ghl')
  `;
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_all_client_sync_target"
          ("runId", "clientId", "clientSlug", "clientName", "provider")
        values
          (${secondSyncRun.id}, ${client.id}, 'legacy-client', 'Legacy Client', 'ghl')
      `,
    "one active synchronization target per client provider",
  );
  console.info("All migrations verified successfully.");
} finally {
  if (test) await test.end();
  await admin.unsafe(
    'drop database if exists "agency_os_migration_test" with (force)',
  );
  await admin.end();
}
