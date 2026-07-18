import "server-only";

import { z } from "zod";

const contactSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().nullish(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
    tags: z.array(z.string()).optional(),
  })
  .strip();

const opportunitySchema = z
  .object({
    id: z.string().min(1),
    locationId: z.string().min(1),
    contactId: z.string().min(1),
    status: z.literal("won"),
    name: z.string().nullish(),
    pipelineId: z.string().nullish(),
    pipelineStageId: z.string().nullish(),
    monetaryValue: z.number().finite().nullish(),
    currency: z.string().max(10).nullish(),
    tags: z.array(z.string()).optional(),
    createdAt: z.string().datetime({ offset: true }),
    lastStatusChangeAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    contact: contactSchema,
  })
  .strip()
  .superRefine((value, context) => {
    if (value.contact.id !== value.contactId) {
      context.addIssue({
        code: "custom",
        message: "Opportunity contact identity mismatch",
        path: ["contact"],
      });
    }
  });

const timezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .superRefine((timezone, context) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    } catch {
      context.addIssue({
        code: "custom",
        message: "Location timezone must be a valid IANA timezone",
      });
    }
  });

const locationSchema = z.object({
  location: z
    .object({
      id: z.string().min(1),
      timezone: timezoneSchema,
    })
    .strip(),
});

const pageSchema = z.object({
  opportunities: z.array(opportunitySchema),
  meta: z
    .object({ nextPageUrl: z.string().url().nullish() })
    .strip()
    .default({}),
});

export type GhlOpportunity = z.infer<typeof opportunitySchema>;

const MAX_REQUEST_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;

function defaultWait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelayMs(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get("retry-after");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1_000, 5_000);
  }
  return 250 * 2 ** attempt;
}

export class GhlClient {
  constructor(
    private readonly baseUrl: URL,
    private readonly fetcher: typeof fetch = fetch,
    private readonly wait: (delayMs: number) => Promise<void> = defaultWait,
  ) {}

  async #request(
    url: URL,
    init: RequestInit,
    operation: string,
  ): Promise<Response> {
    for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
      let response: Response | null = null;
      try {
        const requestSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        const signal = init.signal
          ? AbortSignal.any([init.signal, requestSignal])
          : requestSignal;
        response = await this.fetcher(url, { ...init, signal });
        if (
          response.ok ||
          !isRetryableStatus(response.status) ||
          attempt === MAX_REQUEST_ATTEMPTS - 1
        ) {
          return response;
        }
      } catch (error) {
        if (attempt === MAX_REQUEST_ATTEMPTS - 1) {
          throw new Error(`${operation} failed`, { cause: error });
        }
      }
      await this.wait(retryDelayMs(response, attempt));
    }
    throw new Error(`${operation} failed`);
  }

  async locationTimezone(input: {
    locationId: string;
    token: string;
  }): Promise<string> {
    const url = new URL(
      `/locations/${encodeURIComponent(input.locationId)}`,
      this.baseUrl,
    );
    const response = await this.#request(
      url,
      {
        headers: {
          Authorization: `Bearer ${input.token}`,
          Version: "v3",
          Accept: "application/json",
        },
      },
      "GHL location request",
    );
    if (!response.ok) {
      throw new Error(
        `GHL location request failed with status ${response.status}`,
      );
    }
    const result = locationSchema.parse(await response.json());
    if (result.location.id !== input.locationId) {
      throw new Error("GHL location identity mismatch");
    }
    return result.location.timezone;
  }

  async *wonOpportunities(input: {
    locationId: string;
    token: string;
    floor: Date;
    through: Date;
    onPage?: () => Promise<void>;
  }): AsyncGenerator<GhlOpportunity[]> {
    const firstUrl = new URL("/opportunities/search", this.baseUrl);
    firstUrl.searchParams.set("locationId", input.locationId);
    firstUrl.searchParams.set("status", "won");
    firstUrl.searchParams.set("limit", "100");
    const seen = new Set<string>();
    let nextUrl: URL | null = firstUrl;

    while (nextUrl) {
      if (nextUrl.origin !== this.baseUrl.origin || seen.has(nextUrl.href)) {
        throw new Error("GHL returned an unsafe pagination cursor");
      }
      seen.add(nextUrl.href);
      const response = await this.#request(
        nextUrl,
        {
          headers: {
            Authorization: `Bearer ${input.token}`,
            Version: "v3",
            Accept: "application/json",
          },
        },
        "GHL opportunity request",
      );
      if (!response.ok) {
        throw new Error(`GHL request failed with status ${response.status}`);
      }
      const page = pageSchema.parse(await response.json());
      const rows = page.opportunities
        .filter((row) => row.locationId === input.locationId)
        .sort(
          (left, right) =>
            Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
        );
      const withinWindow = rows.filter((row) => {
        const wonAt = new Date(row.lastStatusChangeAt);
        return wonAt >= input.floor && wonAt <= input.through;
      });
      yield withinWindow;
      await input.onPage?.();

      const cursor = page.meta.nextPageUrl;
      if (
        !cursor ||
        rows.every((row) => new Date(row.updatedAt) < input.floor)
      ) {
        nextUrl = null;
      } else {
        let parsed: URL;
        try {
          parsed = new URL(cursor);
        } catch (error) {
          throw new Error("GHL returned a malformed pagination cursor", {
            cause: error,
          });
        }
        nextUrl = parsed;
      }
    }
  }
}
