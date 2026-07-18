import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createLeadClassificationRule,
  updateLeadClassificationRule,
} from "~/features/settings/server/actions";
import { listLeadClassificationRules } from "~/features/settings/server/queries";
import { db } from "~/server/db";
import { clients, leadClassificationRules } from "~/server/db/schema";

const clientSlug = "lead-classification-settings-test";
let clientId = "";
let ruleId = "";

describe("lead classification settings", () => {
  beforeAll(async () => {
    await db.delete(clients).where(eq(clients.slug, clientSlug));
    const [client] = await db
      .insert(clients)
      .values({ slug: clientSlug, name: "Lead Classification Settings Test" })
      .returning({ id: clients.id });
    if (!client) throw new Error("Could not create classification test client");
    clientId = client.id;
  });

  afterAll(async () => {
    if (clientId) await db.delete(clients).where(eq(clients.id, clientId));
  });

  it("normalizes, lists, updates, and protects per-client categories", async () => {
    const created = await createLeadClassificationRule({
      clientId,
      categoryName: "Ceramic Coating",
      keywords: [" Ceramic ", "ceramic", "Paint-Protection Film"],
      matchMode: "any",
      priority: 80,
    });
    ruleId = created.id;

    const result = await listLeadClassificationRules({ clientId, limit: 100 });
    expect(result.rows).toEqual([
      expect.objectContaining({
        id: ruleId,
        clientId,
        categoryName: "Ceramic Coating",
        keywords: ["ceramic", "paint protection film"],
        matchMode: "any",
        priority: 80,
        status: "active",
      }),
    ]);

    await updateLeadClassificationRule({
      ruleId,
      clientId,
      categoryName: "Ceramic Coating",
      keywords: ["coating", "ceramic"],
      matchMode: "any",
      priority: 70,
      status: "inactive",
    });
    const [updated] = await db
      .select({
        keywords: leadClassificationRules.keywords,
        priority: leadClassificationRules.priority,
        status: leadClassificationRules.status,
      })
      .from(leadClassificationRules)
      .where(eq(leadClassificationRules.id, ruleId));
    expect(updated).toEqual({
      keywords: ["coating", "ceramic"],
      priority: 70,
      status: "inactive",
    });

    await expect(
      createLeadClassificationRule({
        clientId,
        categoryName: "ceramic coating",
        keywords: ["ceramic"],
        matchMode: "any",
        priority: 60,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
