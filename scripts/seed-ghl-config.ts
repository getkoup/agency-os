import { and, eq } from "drizzle-orm";

import { db } from "../src/server/db/index";
import {
  clients,
  ghlClientConfigurations,
  integrationMappings,
} from "../src/server/db/schema";
import { GhlClient } from "../src/server/ghl/client";
import { encryptGhlToken } from "../src/server/ghl/credentials";
import { parseGhlConfig } from "../src/server/ghl/env";

const config = parseGhlConfig();
const client = new GhlClient(config.baseUrl);

for (const mapping of config.mappings) {
  const [storedClient] = await db
    .select({ id: clients.id, status: clients.status })
    .from(clients)
    .where(eq(clients.slug, mapping.clientSlug))
    .limit(1);
  if (!storedClient || storedClient.status !== "active") {
    throw new Error(`Active client ${mapping.clientName} is missing`);
  }
  const [integrationMapping] = await db
    .select({ locationId: integrationMappings.externalLocationId })
    .from(integrationMappings)
    .where(
      and(
        eq(integrationMappings.clientId, storedClient.id),
        eq(integrationMappings.provider, "ghl"),
      ),
    )
    .limit(1);
  if (
    integrationMapping &&
    integrationMapping.locationId !== mapping.locationId
  ) {
    throw new Error(
      `${mapping.clientName} has GHL history for a different Location ID`,
    );
  }
  const timezone = await client.locationTimezone({
    locationId: mapping.locationId,
    token: mapping.token,
  });
  const encrypted = encryptGhlToken({
    clientId: storedClient.id,
    locationId: mapping.locationId,
    token: mapping.token,
  });
  await db
    .insert(ghlClientConfigurations)
    .values({
      clientId: storedClient.id,
      locationId: mapping.locationId,
      timezone,
      ...encrypted,
    })
    .onConflictDoUpdate({
      target: ghlClientConfigurations.clientId,
      set: {
        locationId: mapping.locationId,
        timezone,
        ...encrypted,
        updatedAt: new Date(),
      },
    });
  console.info(`Configured ${mapping.clientName} with timezone ${timezone}`);
}

console.info("Seeded encrypted GHL configuration from environment values.");
process.exit(0);
