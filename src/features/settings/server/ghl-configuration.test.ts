import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  removeGhlClientConfiguration,
  saveGhlClientConfiguration,
} from "~/features/settings/server/actions";
import { getGhlConfigurationStatus } from "~/features/settings/server/queries";
import { db } from "~/server/db";
import { clients, ghlClientConfigurations, users } from "~/server/db/schema";
import { loadStoredGhlConfig } from "~/server/ghl/configuration";
import { decryptGhlToken } from "~/server/ghl/credentials";

const slugs = ["ghl-configuration-test", "ghl-configuration-test-other"];
const userId = "ghl-configuration-owner-test";
let clientId = "";
let otherClientId = "";
const locationId = "ghl-configuration-location";
const token = "pit-ghl-configuration-private-token";

beforeAll(async () => {
  await db.delete(clients).where(inArray(clients.slug, slugs));
  await db.delete(users).where(eq(users.id, userId));
  await db.insert(users).values({
    id: userId,
    name: "GHL Configuration Owner",
    email: "ghl-configuration-owner@example.com",
    role: "owner",
  });
  const rows = await db
    .insert(clients)
    .values([
      { slug: slugs[0]!, name: "GHL Configuration Test" },
      { slug: slugs[1]!, name: "GHL Configuration Test Other" },
    ])
    .returning({ id: clients.id, slug: clients.slug });
  const client = rows.find(({ slug }) => slug === slugs[0]);
  const otherClient = rows.find(({ slug }) => slug === slugs[1]);
  if (!client || !otherClient) throw new Error("Could not create GHL clients");
  clientId = client.id;
  otherClientId = otherClient.id;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      const requestedLocationId = decodeURIComponent(
        url.pathname.split("/").at(-1) ?? "",
      );
      return Response.json({
        location: {
          id: requestedLocationId,
          timezone: "America/New_York",
        },
      });
    }),
  );
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await db.delete(clients).where(inArray(clients.slug, slugs));
  await db.delete(users).where(eq(users.id, userId));
});

describe("stored GHL client configuration", () => {
  it("verifies, encrypts, lists, and decrypts a client token", async () => {
    await saveGhlClientConfiguration({
      clientId,
      locationId,
      token,
      userId,
    });
    const [stored] = await db
      .select()
      .from(ghlClientConfigurations)
      .where(eq(ghlClientConfigurations.clientId, clientId));
    if (!stored) throw new Error("GHL configuration was not stored");

    expect(stored.encryptedToken).not.toContain(token);
    expect(stored.timezone).toBe("America/New_York");
    expect(
      decryptGhlToken({
        clientId,
        locationId,
        encryptedToken: stored.encryptedToken,
        tokenIv: stored.tokenIv,
        tokenAuthTag: stored.tokenAuthTag,
      }),
    ).toBe(token);
    const status = (await getGhlConfigurationStatus()).find(
      (row) => row.clientId === clientId,
    );
    expect(status).toMatchObject({
      configured: true,
      locationId,
      timezone: "America/New_York",
      tokenHint: "••••oken",
      mappingState: "pending_sync",
    });
    expect(JSON.stringify(status)).not.toMatch(
      /encryptedToken|tokenIv|tokenAuthTag|pit-ghl/i,
    );
    const config = await loadStoredGhlConfig();
    expect(config.mappings).toContainEqual({
      clientSlug: slugs[0],
      clientName: "GHL Configuration Test",
      locationId,
      token,
    });
  });

  it("prevents one location from being assigned to two clients", async () => {
    await expect(
      saveGhlClientConfiguration({
        clientId: otherClientId,
        locationId,
        token,
        userId,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("removes credentials without deleting the client", async () => {
    await removeGhlClientConfiguration(clientId);
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, clientId));
    const stored = await db
      .select({ clientId: ghlClientConfigurations.clientId })
      .from(ghlClientConfigurations)
      .where(eq(ghlClientConfigurations.clientId, clientId));

    expect(client?.id).toBe(clientId);
    expect(stored).toHaveLength(0);
  });
});
