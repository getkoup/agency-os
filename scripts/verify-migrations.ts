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
  for (const statement of source.split("--> statement-breakpoint")) {
    if (statement.trim()) await sqlClient.unsafe(statement);
  }
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
    JSON.stringify(["owner", "admin", "client"])
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
      ("integrationMappingId", "contactId", "externalId", "status", "wonAt",
       "providerUpdatedAt", "rawPayload")
    values (${mapping.id}, ${contact.id}, 'migration-opportunity', 'won', now(),
      now(), '{}')
    returning "tags"
  `;
  if (!opportunity || opportunity.tags.length !== 0) {
    throw new Error("GHL opportunity tags do not default to an empty array");
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
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_integration_mapping"
          ("clientId", "provider", "externalLocationId", "syncFromAt")
        values (${client.id}, 'ghl', 'other-location', now())
      `,
    "one provider mapping per client",
  );
  await test`
    insert into "agency_os_all_client_sync_run" ("requestedByUserId")
    values ('legacy-owner')
  `;
  await expectConstraintViolation(
    () =>
      test!`
        insert into "agency_os_all_client_sync_run" ("requestedByUserId")
        values ('legacy-owner')
      `,
    "one running all-client sync",
  );
  console.info("All migrations verified successfully.");
} finally {
  if (test) await test.end();
  await admin.unsafe(
    'drop database if exists "agency_os_migration_test" with (force)',
  );
  await admin.end();
}
