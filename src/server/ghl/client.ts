import "server-only";

import { z } from "zod";

const contactSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().nullish(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
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

const pageSchema = z.object({
  opportunities: z.array(opportunitySchema),
  meta: z
    .object({ nextPageUrl: z.string().url().nullish() })
    .strip()
    .default({}),
});

export type GhlOpportunity = z.infer<typeof opportunitySchema>;

export class GhlClient {
  constructor(
    private readonly baseUrl: URL,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

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
      const response = await this.fetcher(nextUrl, {
        headers: {
          Authorization: `Bearer ${input.token}`,
          Version: "v3",
          Accept: "application/json",
        },
      });
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
