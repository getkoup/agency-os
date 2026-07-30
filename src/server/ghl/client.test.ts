import { afterEach, describe, expect, it, vi } from "vitest";

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
  source: "Facebook",
  createdAt: "2026-07-15T08:55:00.000Z",
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    const requestedUrl =
      request instanceof URL
        ? request.href
        : typeof request === "string"
          ? request
          : request.url;
    expect(requestedUrl).toBe(
      "https://services.leadconnectorhq.com/locations/location-1",
    );
  });

  it("retries transient provider failures with exponential jitter", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(
        Response.json({
          location: { id: "location-1", timezone: "America/New_York" },
        }),
      );
    const wait = vi
      .fn<(delayMs: number) => Promise<void>>()
      .mockResolvedValue();
    const client = new GhlClient(
      new URL("https://services.leadconnectorhq.com"),
      fetcher,
      wait,
      { random: () => 0.5 },
    );

    await expect(
      client.locationTimezone({
        locationId: "location-1",
        token: "private-token",
      }),
    ).resolves.toBe("America/New_York");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[375], [750]]);
  });

  it("waits for the documented GHL rate-limit interval before retrying", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: {
            "X-RateLimit-Interval-Milliseconds": "10000",
            "X-RateLimit-Remaining": "0",
          },
        }),
      )
      .mockResolvedValue(
        Response.json({
          location: { id: "location-1", timezone: "America/New_York" },
        }),
      );
    let currentTime = 0;
    const wait = vi.fn(async (delayMs: number) => {
      currentTime += delayMs;
    });
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const client = new GhlClient(
      new URL("https://services.leadconnectorhq.com"),
      fetcher,
      wait,
      { now: () => currentTime, random: () => 0 },
    );

    await expect(
      client.locationTimezone({
        locationId: "location-1",
        token: "private-token",
      }),
    ).resolves.toBe("America/New_York");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(10_250);
    expect(warning).toHaveBeenCalledWith(
      "GHL API rate limit reached",
      expect.objectContaining({
        locationId: "location-1",
        intervalMs: 10_000,
        remaining: 0,
      }),
    );
  });

  it("honors Retry-After without truncating the provider delay", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: { "Retry-After": "12" },
        }),
      )
      .mockResolvedValue(
        Response.json({
          location: { id: "location-1", timezone: "America/New_York" },
        }),
      );
    let currentTime = 0;
    const wait = vi.fn(async (delayMs: number) => {
      currentTime += delayMs;
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = new GhlClient(
      new URL("https://services.leadconnectorhq.com"),
      fetcher,
      wait,
      { now: () => currentTime, random: () => 0 },
    );

    await expect(
      client.locationTimezone({
        locationId: "location-1",
        token: "private-token",
      }),
    ).resolves.toBe("America/New_York");
    expect(wait).toHaveBeenCalledWith(12_250);
  });

  it("holds the 81st location request until the next burst window", async () => {
    let currentTime = 0;
    const wait = vi.fn(async (delayMs: number) => {
      currentTime += delayMs;
    });
    const fetcher = vi.fn<typeof fetch>().mockImplementation((request) => {
      const url = new URL(
        request instanceof URL
          ? request.href
          : typeof request === "string"
            ? request
            : request.url,
      );
      const contactId = decodeURIComponent(url.pathname.split("/").at(-1)!);
      return Promise.resolve(
        Response.json({
          contact: {
            id: contactId,
            name: contactId,
            email: null,
            phone: null,
            tags: [],
            source: null,
            attributionSource: null,
            lastAttributionSource: null,
            dateAdded: "2026-07-15T12:00:00.000Z",
            dateUpdated: "2026-07-15T12:00:00.000Z",
          },
        }),
      );
    });
    const client = new GhlClient(
      new URL("https://services.leadconnectorhq.com"),
      fetcher,
      wait,
      { now: () => currentTime, random: () => 0 },
    );

    await Promise.all(
      Array.from({ length: 81 }, (_, index) =>
        client.contact({
          contactId: `contact-${index + 1}`,
          locationId: "location-1",
          token: "private-token",
        }),
      ),
    );

    expect(fetcher).toHaveBeenCalledTimes(81);
    expect(wait.mock.calls).toEqual([[10_000]]);
  });

  it("does not retry an exhausted daily allowance", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: { "X-RateLimit-Daily-Remaining": "0" },
      }),
    );
    const wait = vi
      .fn<(delayMs: number) => Promise<void>>()
      .mockResolvedValue();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = new GhlClient(
      new URL("https://services.leadconnectorhq.com"),
      fetcher,
      wait,
      { random: () => 0 },
    );

    await expect(
      client.locationTimezone({
        locationId: "location-1",
        token: "private-token",
      }),
    ).rejects.toThrow("status 429");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("does not retry authentication failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const wait = vi
      .fn<(delayMs: number) => Promise<void>>()
      .mockResolvedValue();
    const client = new GhlClient(
      new URL("https://services.leadconnectorhq.com"),
      fetcher,
      wait,
    );

    await expect(
      client.locationTimezone({
        locationId: "location-1",
        token: "private-token",
      }),
    ).rejects.toThrow("status 401");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
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
    expect(rows[0]?.source).toBe("Facebook");
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
