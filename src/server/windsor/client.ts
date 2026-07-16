import { z } from "zod";

import {
  parseWindsorEnvironment,
  type WindsorEnvironment,
} from "~/server/windsor/env";

const discoveryAccountSchema = z.object({
  account_id: z.string().min(1),
  account_name: z.string().default(""),
  datasource: z.string().min(1),
});

const nullableValue = z.union([z.string(), z.number(), z.null()]).optional();

export const performanceRowSchema = z
  .object({
    date: z.string().date(),
    account_id: z.string().min(1),
    account_name: z.string().default(""),
    campaign_id: z.string().min(1),
    campaign: z.string().default(""),
    adset_id: z.string().min(1),
    adset_name: z.string().default(""),
    ad_id: z.string().min(1),
    ad_name: z.string().default(""),
    currency: z.string().nullish(),
    spend: nullableValue,
    impressions: nullableValue,
    reach: nullableValue,
    clicks: nullableValue,
    link_clicks: nullableValue,
    actions_post_engagement: nullableValue,
    actions_lead: nullableValue,
    actions_onsite_conversion_messaging_conversation_started_7d: nullableValue,
    actions_onsite_conversion_total_messaging_connection: nullableValue,
    actions_leadgen_grouped: nullableValue,
    cost_per_action_type_lead: nullableValue,
    cpc: nullableValue,
    ctr: nullableValue,
  })
  .passthrough();

export const leadRowSchema = z
  .object({
    id: z.string().min(1),
    created_time: z.string().min(1),
    account_id: z.string().min(1),
    account_name: z.string().default(""),
    campaign_id: z.string().nullish(),
    campaign: z.string().nullish(),
    adset_id: z.string().nullish(),
    adset_name: z.string().nullish(),
    ad_id: z.string().nullish(),
    ad_name: z.string().nullish(),
    form_id: z.string().nullish(),
    email: z.string().nullish(),
    full_name: z.string().nullish(),
    phone: z.string().nullish(),
    phone_number: z.string().nullish(),
  })
  .passthrough();

export type DiscoveryAccount = z.infer<typeof discoveryAccountSchema>;
export type PerformanceRow = z.infer<typeof performanceRowSchema>;
export type LeadRow = z.infer<typeof leadRowSchema>;

const PERFORMANCE_FIELDS = [
  "date",
  "account_id",
  "account_name",
  "campaign_id",
  "campaign",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "currency",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "actions_onsite_conversion_messaging_conversation_started_7d",
  "actions_onsite_conversion_total_messaging_connection",
  "actions_post_engagement",
  "link_clicks",
  "actions_lead",
  "actions_leadgen_grouped",
  "cost_per_action_type_lead",
  "cpc",
  "ctr",
].join(",");

const LEAD_FIELDS = [
  "id",
  "created_time",
  "account_id",
  "account_name",
  "campaign_id",
  "campaign",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "form_id",
  "email",
  "full_name",
  "phone",
  "phone_number",
].join(",");

export class WindsorClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WindsorClientError";
  }
}

function rowsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    Array.isArray(payload.data)
  ) {
    return payload.data;
  }
  throw new WindsorClientError("Windsor response did not contain a row array");
}

export class WindsorClient {
  readonly #environment: WindsorEnvironment;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;

  constructor(
    environment: WindsorEnvironment = parseWindsorEnvironment(),
    fetchImplementation: typeof fetch = fetch,
    now: () => Date = () => new Date(),
  ) {
    this.#environment = environment;
    this.#fetch = fetchImplementation;
    this.#now = now;
  }

  async #request(url: URL): Promise<unknown> {
    try {
      const response = await this.#fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      const safeUrl = new URL(url);
      safeUrl.searchParams.set("api_key", "[REDACTED]");
      throw new WindsorClientError(`Windsor request failed: ${safeUrl}`, {
        cause: error,
      });
    }
  }

  async discoverAccounts(): Promise<DiscoveryAccount[]> {
    const url = new URL(
      "/api/common/ds-accounts",
      this.#environment.WINDSOR_ONBOARD_BASE_URL,
    );
    url.searchParams.set("datasource", "all");
    url.searchParams.set("api_key", this.#environment.WINDSOR_API_KEY);
    return z.array(discoveryAccountSchema).parse(await this.#request(url));
  }

  async fetchPerformance(
    selectAccounts: readonly string[],
  ): Promise<PerformanceRow[]> {
    const rows = await this.#fetchData(
      "facebook",
      selectAccounts,
      PERFORMANCE_FIELDS,
    );
    return z.array(performanceRowSchema).parse(rows);
  }

  async fetchLeads(selectAccounts: readonly string[]): Promise<LeadRow[]> {
    const rows = await this.#fetchData(
      "facebook_leads",
      selectAccounts,
      LEAD_FIELDS,
    );
    return z.array(leadRowSchema).parse(rows);
  }

  async #fetchData(
    connector: string,
    selectAccounts: readonly string[],
    fields: string,
  ): Promise<unknown[]> {
    const url = new URL("/all", this.#environment.WINDSOR_DATA_BASE_URL);
    url.searchParams.set("api_key", this.#environment.WINDSOR_API_KEY);
    const through = this.#now();
    const from = new Date(through);
    from.setUTCDate(from.getUTCDate() - 8);
    url.searchParams.set("date_from", from.toISOString().slice(0, 10));
    url.searchParams.set("date_to", through.toISOString().slice(0, 10));
    url.searchParams.set("fields", fields);
    url.searchParams.set("select_accounts", selectAccounts.join(","));
    url.searchParams.set("connector", connector);
    return rowsFromPayload(await this.#request(url));
  }
}
