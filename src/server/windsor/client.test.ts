import { describe, expect, it, vi } from "vitest";

import { WindsorClient } from "./client";

const environment = {
  WINDSOR_API_KEY: "test-secret-key",
  WINDSOR_DATA_BASE_URL: "https://data.example.com",
  WINDSOR_ONBOARD_BASE_URL: "https://onboard.example.com",
};

describe("WindsorClient", () => {
  it("validates discovered connector accounts", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            account_id: "facebook__123",
            account_name: "Example",
            datasource: "facebook",
          },
        ]),
        { status: 200 },
      ),
    );
    const client = new WindsorClient(environment, fetchMock);
    await expect(client.discoverAccounts()).resolves.toHaveLength(1);
    const requestedUrl = fetchMock.mock.calls[0]?.[0];
    expect(requestedUrl).toBeInstanceOf(URL);
    if (!(requestedUrl instanceof URL)) throw new Error("Expected URL request");
    expect(requestedUrl.pathname).toBe("/api/common/ds-accounts");
  });

  it("includes the current UTC day for localized reporting boundaries", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [] }));
    const client = new WindsorClient(
      environment,
      fetchMock,
      () => new Date("2026-07-16T06:00:00.000Z"),
    );
    await client.fetchLeads(["facebook_leads__123"]);
    const requestedUrl = fetchMock.mock.calls[0]?.[0];
    expect(requestedUrl).toBeInstanceOf(URL);
    if (!(requestedUrl instanceof URL)) throw new Error("Expected URL request");
    expect(requestedUrl.searchParams.get("date_from")).toBe("2026-07-08");
    expect(requestedUrl.searchParams.get("date_to")).toBe("2026-07-16");
    expect(requestedUrl.searchParams.has("date_preset")).toBe(false);
  });

  it("redacts API keys from request failures", async () => {
    const client = new WindsorClient(
      environment,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 500 })),
    );
    await expect(client.discoverAccounts()).rejects.not.toThrow(
      environment.WINDSOR_API_KEY,
    );
    await expect(client.discoverAccounts()).rejects.toThrow("REDACTED");
  });

  it("rejects malformed performance identities", async () => {
    const client = new WindsorClient(
      environment,
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ date: "2026-07-10" }] }), {
          status: 200,
        }),
      ),
    );
    await expect(client.fetchPerformance(["facebook__123"])).rejects.toThrow();
  });
});
