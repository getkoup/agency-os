import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { clients, ghlClientConfigurations } from "~/server/db/schema";
import { decryptGhlToken } from "~/server/ghl/credentials";
import { parseGhlBaseUrl, type GhlConfig } from "~/server/ghl/env";

export async function loadStoredGhlConfig(): Promise<GhlConfig> {
  const rows = await db
    .select({
      clientId: clients.id,
      clientSlug: clients.slug,
      clientName: clients.name,
      locationId: ghlClientConfigurations.locationId,
      encryptedToken: ghlClientConfigurations.encryptedToken,
      tokenIv: ghlClientConfigurations.tokenIv,
      tokenAuthTag: ghlClientConfigurations.tokenAuthTag,
    })
    .from(ghlClientConfigurations)
    .innerJoin(clients, eq(ghlClientConfigurations.clientId, clients.id))
    .where(eq(clients.status, "active"))
    .orderBy(asc(clients.slug), asc(clients.id));
  return {
    baseUrl: parseGhlBaseUrl(),
    mappings: rows.map((row) => ({
      clientSlug: row.clientSlug,
      clientName: row.clientName,
      locationId: row.locationId,
      token: decryptGhlToken({
        clientId: row.clientId,
        locationId: row.locationId,
        encryptedToken: row.encryptedToken,
        tokenIv: row.tokenIv,
        tokenAuthTag: row.tokenAuthTag,
      }),
    })),
  };
}
