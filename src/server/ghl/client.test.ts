import { describe, expect, it, vi } from "vitest";

import { GhlClient } from "~/server/ghl/client";

const opportunity = {
  id: "opportunity-1",
  locationId: "location-1",
  contactId: "contact-1",
  status: "won",
  name: "New customer",
  pipelineId: "pipeline-1",
  pipelineStageId: "stage-won",
  monetaryValue: 500,
  currency: "USD",
  lastStatusChangeAt: "2026-07-15T09:00:00.000Z",
  updatedAt: "2026-07-15T09:01:00.000Z",
  contact: {
    id: "contact-1",
    name: "Customer",
    email: "customer@example.com",
    phone: "+15555550100",
  },
};

async function collect(client: GhlClient) {
  const rows = [];
  for await (const page of client.wonOpportunities({
    locationId: "location-1",
    token: "private-token",
    floor: new Date("2026-07-15T08:00:00.000Z"),
    through: new Date("2026-07-15T10:00:00.000Z"),
  })) {
    rows.push(...page);
  }
  return rows;
}

describe("GhlClient", () => {
  it("loads and validates the location timezone", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        location: { id: "location-1", timezone: "America/New_York" },
      }),
    );
    const client = new GhlClient(
      new URL("https://services.leadconnectorhq.com"),
      fetcher,
    );

    await expect(
      client.locationTimezone({
        locationId: "location-1",
        token: "private-token",
      }),
    ).resolves.toBe("America/New_York");
    const [request] = fetcher.mock.calls[0]!;
    expect(String(request)).toBe(
      "https://services.leadconnectorhq.com/locations/location-1",
    );
  });

  it("rejects an invalid provider timezone", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        location: { id: "location-1", timezone: "not/a-timezone" },
      }),
    );
    const client = new GhlClient(
      new URL("https://services.leadconnectorhq.com"),
      fetcher,
    );

    await expect(
      client.locationTimezone({
        locationId: "location-1",
        token: "private-token",
      }),
    ).rejects.toThrow("valid IANA timezone");
  });

  it("uses the v3 bearer contract and exact won query", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ opportunities: [opportunity], meta: {} }),
      );
    const rows = await collect(
      new GhlClient(new URL("https://services.leadconnectorhq.com"), fetcher),
    );
    expect(rows).toHaveLength(1);
    const [request, init] = fetcher.mock.calls[0]!;
    const url = new URL(
      request instanceof URL
        ? request.href
        : typeof request === "string"
          ? request
          : request.url,
    );
    expect(url.pathname).toBe("/opportunities/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      locationId: "location-1",
      status: "won",
      limit: "100",
    });
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer private-token",
      Version: "v3",
    });
  });
  it("accepts optional opportunity and embedded contact tags", async () => {
    const tagged = {
      ...opportunity,
      tags: ["Premium", " Qualified "],
      contact: { ...opportunity.contact, tags: ["Customer"] },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ opportunities: [tagged], meta: {} }));
    const rows = await collect(
      new GhlClient(new URL("https://services.leadconnectorhq.com"), fetcher),
    );
    expect(rows[0]?.tags).toEqual(["Premium", " Qualified "]);
    expect(rows[0]?.contact.tags).toEqual(["Customer"]);
  });

  it("rejects cross-origin cursors before forwarding credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        opportunities: [opportunity],
        meta: { nextPageUrl: "https://attacker.example/next" },
      }),
    );
    await expect(
      collect(
        new GhlClient(new URL("https://services.leadconnectorhq.com"), fetcher),
      ),
    ).rejects.toThrow("unsafe pagination cursor");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects missing provider timestamps", async () => {
    const invalid = { ...opportunity, updatedAt: undefined };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ opportunities: [invalid], meta: {} }));
    await expect(
      collect(
        new GhlClient(new URL("https://services.leadconnectorhq.com"), fetcher),
      ),
    ).rejects.toThrow();
  });
});
