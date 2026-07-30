import "server-only";

import { z } from "zod";

import { GhlRateLimiter } from "~/server/ghl/rate-limiter";

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
    source: z.string().max(2_000).nullish(),
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

const calendarSchema = z
  .object({
    id: z.string().min(1),
    locationId: z.string().min(1),
    name: z.string().min(1),
    isActive: z.boolean().default(true),
  })
  .strip();

const calendarsSchema = z
  .object({ calendars: z.array(calendarSchema) })
  .strip();

const appointmentStatusSchema = z.enum([
  "new",
  "confirmed",
  "showed",
  "cancelled",
  "noshow",
  "invalid",
]);

const calendarEventSchema = z
  .object({
    id: z.string().min(1),
    locationId: z.string().min(1),
    calendarId: z.string().min(1),
    contactId: z.string().min(1),
    appointmentStatus: appointmentStatusSchema,
    startTime: z.string().datetime({ offset: true }),
    endTime: z.string().datetime({ offset: true }),
    dateAdded: z.string().datetime({ offset: true }),
    dateUpdated: z.string().datetime({ offset: true }),
    title: z.string().nullish(),
    deleted: z.boolean().default(false),
  })
  .strip();

const calendarEventsSchema = z
  .object({ events: z.array(calendarEventSchema) })
  .strip();

const attributionSchema = z.record(z.string(), z.unknown()).nullish();

const contactResponseSchema = z
  .object({
    contact: contactSchema.extend({
      source: z.string().nullish(),
      attributionSource: attributionSchema,
      lastAttributionSource: attributionSchema,
      dateAdded: z.string().datetime({ offset: true }),
      dateUpdated: z.string().datetime({ offset: true }),
    }),
  })
  .strip();

export type GhlOpportunity = z.infer<typeof opportunitySchema>;
export type GhlCalendar = z.infer<typeof calendarSchema>;
export type GhlCalendarEvent = z.infer<typeof calendarEventSchema>;
export type GhlContact = z.infer<typeof contactResponseSchema>["contact"];

const MAX_REQUEST_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const GHL_BURST_INTERVAL_MS = 10_000;
const GHL_BURST_REQUEST_BUDGET = 80;
const GHL_RATE_LIMIT_SAFETY_RATIO = 0.8;
const BASE_RETRY_DELAY_MS = 250;

type GhlClientOptions = {
  now?: () => number;
  random?: () => number;
};

type GhlRateLimitSnapshot = {
  dailyLimit: number | null;
  dailyRemaining: number | null;
  intervalMs: number | null;
  maxRequests: number | null;
  remaining: number | null;
  retryAfterMs: number | null;
};

function defaultWait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function nonNegativeHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function retryAfterMs(headers: Headers, now: number): number | null {
  const value = headers.get("retry-after");
  if (value === null) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : null;
}

function rateLimitSnapshot(
  response: Response,
  now: number,
): GhlRateLimitSnapshot {
  return {
    dailyLimit: nonNegativeHeader(response.headers, "x-ratelimit-limit-daily"),
    dailyRemaining: nonNegativeHeader(
      response.headers,
      "x-ratelimit-daily-remaining",
    ),
    intervalMs: nonNegativeHeader(
      response.headers,
      "x-ratelimit-interval-milliseconds",
    ),
    maxRequests: nonNegativeHeader(response.headers, "x-ratelimit-max"),
    remaining: nonNegativeHeader(response.headers, "x-ratelimit-remaining"),
    retryAfterMs: retryAfterMs(response.headers, now),
  };
}

function jitteredBackoffMs(attempt: number, random: () => number): number {
  const randomValue = random();
  const jitter = Number.isFinite(randomValue)
    ? Math.min(1, Math.max(0, randomValue))
    : 0.5;
  return Math.ceil(BASE_RETRY_DELAY_MS * 2 ** attempt * (1 + jitter));
}

function retryDelayMs(
  response: Response | null,
  attempt: number,
  now: number,
  random: () => number,
): number {
  const backoffMs = jitteredBackoffMs(attempt, random);
  if (!response) return backoffMs;
  const snapshot = rateLimitSnapshot(response, now);
  if (response.status === 429) {
    const providerDelayMs = Math.max(
      snapshot.retryAfterMs ?? 0,
      snapshot.intervalMs ?? GHL_BURST_INTERVAL_MS,
    );
    return providerDelayMs + backoffMs;
  }
  return Math.max(backoffMs, snapshot.retryAfterMs ?? 0);
}

function failedResponseError(
  operation: string,
  response: Response,
  now: number,
): Error {
  if (response.status !== 429) {
    return new Error(`${operation} failed with status ${response.status}`);
  }
  const snapshot = rateLimitSnapshot(response, now);
  const details = [
    snapshot.remaining === null ? null : `remaining=${snapshot.remaining}`,
    snapshot.intervalMs === null ? null : `intervalMs=${snapshot.intervalMs}`,
    snapshot.dailyRemaining === null
      ? null
      : `dailyRemaining=${snapshot.dailyRemaining}`,
  ].filter((detail): detail is string => detail !== null);
  const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
  return new Error(
    `${operation} failed with status ${response.status}${suffix}`,
  );
}

export class GhlClient {
  readonly #now: () => number;
  readonly #random: () => number;
  readonly #rateLimiter: GhlRateLimiter;

  constructor(
    private readonly baseUrl: URL,
    private readonly fetcher: typeof fetch = fetch,
    private readonly wait: (delayMs: number) => Promise<void> = defaultWait,
    options: GhlClientOptions = {},
  ) {
    this.#now = options.now ?? Date.now;
    this.#random = options.random ?? Math.random;
    this.#rateLimiter = new GhlRateLimiter({
      maxRequests: GHL_BURST_REQUEST_BUDGET,
      intervalMs: GHL_BURST_INTERVAL_MS,
      now: this.#now,
      wait: this.wait,
    });
  }

  async #request(
    url: URL,
    init: RequestInit,
    operation: string,
    resourceId: string,
  ): Promise<Response> {
    for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
      await this.#rateLimiter.acquire(resourceId);
      let response: Response;
      try {
        const requestSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        const signal = init.signal
          ? AbortSignal.any([init.signal, requestSignal])
          : requestSignal;
        response = await this.fetcher(url, { ...init, signal });
      } catch (error) {
        if (attempt === MAX_REQUEST_ATTEMPTS - 1) {
          throw new Error(`${operation} failed`, { cause: error });
        }
        await this.wait(retryDelayMs(null, attempt, this.#now(), this.#random));
        continue;
      }

      const snapshot = this.#observeRateLimit(resourceId, operation, response);
      if (
        response.ok ||
        !isRetryableStatus(response.status) ||
        snapshot.dailyRemaining === 0 ||
        attempt === MAX_REQUEST_ATTEMPTS - 1
      ) {
        return response;
      }

      const delayMs = retryDelayMs(
        response,
        attempt,
        this.#now(),
        this.#random,
      );
      if (response.status === 429) {
        this.#rateLimiter.blockFor(resourceId, delayMs);
      } else {
        await this.wait(delayMs);
      }
    }
    throw new Error(`${operation} failed`);
  }

  #observeRateLimit(
    resourceId: string,
    operation: string,
    response: Response,
  ): GhlRateLimitSnapshot {
    const snapshot = rateLimitSnapshot(response, this.#now());
    this.#rateLimiter.updateWindow(resourceId, {
      maxRequests:
        snapshot.maxRequests === null
          ? undefined
          : Math.max(
              1,
              Math.floor(snapshot.maxRequests * GHL_RATE_LIMIT_SAFETY_RATIO),
            ),
      intervalMs: snapshot.intervalMs ?? undefined,
    });
    if (snapshot.remaining === 0) {
      this.#rateLimiter.blockFor(
        resourceId,
        snapshot.intervalMs ?? GHL_BURST_INTERVAL_MS,
      );
    }
    if (snapshot.dailyRemaining === 0) {
      this.#rateLimiter.markDailyExhausted(resourceId);
    }
    if (response.status === 429) {
      console.warn("GHL API rate limit reached", {
        operation,
        locationId: resourceId,
        dailyLimit: snapshot.dailyLimit,
        dailyRemaining: snapshot.dailyRemaining,
        intervalMs: snapshot.intervalMs,
        maxRequests: snapshot.maxRequests,
        remaining: snapshot.remaining,
        retryAfterMs: snapshot.retryAfterMs,
      });
    }
    return snapshot;
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
      input.locationId,
    );
    if (!response.ok) {
      throw failedResponseError("GHL location request", response, this.#now());
    }
    const result = locationSchema.parse(await response.json());
    if (result.location.id !== input.locationId) {
      throw new Error("GHL location identity mismatch");
    }
    return result.location.timezone;
  }

  async calendars(input: {
    locationId: string;
    token: string;
  }): Promise<GhlCalendar[]> {
    const url = new URL("/calendars/", this.baseUrl);
    url.searchParams.set("locationId", input.locationId);
    const response = await this.#request(
      url,
      {
        headers: {
          Authorization: `Bearer ${input.token}`,
          Version: "2021-04-15",
          Accept: "application/json",
        },
      },
      "GHL calendar request",
      input.locationId,
    );
    if (!response.ok) {
      throw failedResponseError("GHL calendar request", response, this.#now());
    }
    return calendarsSchema
      .parse(await response.json())
      .calendars.filter((calendar) => calendar.locationId === input.locationId);
  }

  async calendarEvents(input: {
    locationId: string;
    calendarId: string;
    token: string;
    start: Date;
    end: Date;
  }): Promise<GhlCalendarEvent[]> {
    const url = new URL("/calendars/events", this.baseUrl);
    url.searchParams.set("locationId", input.locationId);
    url.searchParams.set("calendarId", input.calendarId);
    url.searchParams.set("startTime", String(input.start.getTime()));
    url.searchParams.set("endTime", String(input.end.getTime()));
    const response = await this.#request(
      url,
      {
        headers: {
          Authorization: `Bearer ${input.token}`,
          Version: "2021-04-15",
          Accept: "application/json",
        },
      },
      "GHL calendar event request",
      input.locationId,
    );
    if (!response.ok) {
      throw failedResponseError(
        "GHL calendar event request",
        response,
        this.#now(),
      );
    }
    return calendarEventsSchema
      .parse(await response.json())
      .events.filter(
        (event) =>
          event.locationId === input.locationId &&
          event.calendarId === input.calendarId,
      );
  }

  async contact(input: {
    contactId: string;
    locationId: string;
    token: string;
  }): Promise<GhlContact> {
    const url = new URL(
      `/contacts/${encodeURIComponent(input.contactId)}`,
      this.baseUrl,
    );
    const response = await this.#request(
      url,
      {
        headers: {
          Authorization: `Bearer ${input.token}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
      },
      "GHL contact request",
      input.locationId,
    );
    if (!response.ok) {
      throw failedResponseError("GHL contact request", response, this.#now());
    }
    const contact = contactResponseSchema.parse(await response.json()).contact;
    if (contact.id !== input.contactId) {
      throw new Error("GHL contact identity mismatch");
    }
    return contact;
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
        input.locationId,
      );
      if (!response.ok) {
        throw failedResponseError(
          "GHL opportunity request",
          response,
          this.#now(),
        );
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
