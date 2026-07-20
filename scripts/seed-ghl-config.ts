import { and, eq } from "drizzle-orm";

import { db } from "../src/server/db/index";
import {
  clients,
  ghlClientConfigurations,
  integrationMappings,
} from "../src/server/db/schema";
import { GhlClient } from "../src/server/ghl/client";
import {
  encryptGhlToken,
  type EncryptedGhlToken,
} from "../src/server/ghl/credentials";
import { parseGhlConfig } from "../src/server/ghl/env";

const config = parseGhlConfig();
const client = new GhlClient(config.baseUrl);
const verified: Array<{
  clientId: string;
  clientName: string;
  locationId: string;
  timezone: string;
  encrypted: EncryptedGhlToken;
}> = [];

for (const mapping of config.mappings) {
  const [storedClient] = await db
    .select({ id: clients.id, status: clients.status })
    .from(clients)
    .where(eq(clients.slug, mapping.clientSlug))
    .limit(1);
  if (storedClient?.status !== "active") {
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
    integrationMapping?.locationId &&
    integrationMapping.locationId !== mapping.locationId
  ) {
    throw new Error(
      `${mapping.clientName} has GHL history for a different Location ID`,
    );
  }
  let timezone: string;
  try {
    timezone = await client.locationTimezone({
      locationId: mapping.locationId,
      token: mapping.token,
    });
  } catch (error) {
    throw new Error(
      `${mapping.clientName} credentials need Location read permission`,
      { cause: error },
    );
  }
  verified.push({
    clientId: storedClient.id,
    clientName: mapping.clientName,
    locationId: mapping.locationId,
    timezone,
    encrypted: encryptGhlToken({
      clientId: storedClient.id,
      locationId: mapping.locationId,
      token: mapping.token,
    }),
  });
}

await db.transaction(async (tx) => {
  for (const value of verified) {
    await tx
      .insert(ghlClientConfigurations)
      .values({
        clientId: value.clientId,
        locationId: value.locationId,
        timezone: value.timezone,
        ...value.encrypted,
      })
      .onConflictDoUpdate({
        target: ghlClientConfigurations.clientId,
        set: {
          locationId: value.locationId,
          timezone: value.timezone,
          ...value.encrypted,
          updatedAt: new Date(),
        },
      });
  }
});
for (const value of verified) {
  console.info(
    `Configured ${value.clientName} with timezone ${value.timezone}`,
  );
}
console.info("Seeded encrypted GHL configuration from environment values.");
process.exit(0);
