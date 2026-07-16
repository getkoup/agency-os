import "server-only";

import { z } from "zod";

const httpsUrl = z
  .string()
  .url()
  .transform((value) => new URL(value))
  .refine((url) => url.protocol === "https:", "GHL API URL must use HTTPS");

const nonBlank = z.string().trim().min(1);

const schema = z
  .object({
    GHL_API_BASE_URL: httpsUrl.default("https://services.leadconnectorhq.com"),
    GHL_TINT_LAB_LOCATION_ID: nonBlank,
    GHL_TINT_LAB_PRIVATE_INTEGRATION_TOKEN: nonBlank,
    GHL_DIAMOND_LOCATION_ID: nonBlank,
    GHL_DIAMOND_PRIVATE_INTEGRATION_TOKEN: nonBlank,
  })
  .superRefine((value, context) => {
    if (value.GHL_TINT_LAB_LOCATION_ID === value.GHL_DIAMOND_LOCATION_ID) {
      context.addIssue({
        code: "custom",
        message: "GHL location IDs must be unique",
        path: ["GHL_DIAMOND_LOCATION_ID"],
      });
    }
  });

export interface GhlClientMapping {
  clientSlug: "tint-lab" | "diamond-auto-restoration";
  clientName: string;
  locationId: string;
  token: string;
}

export interface GhlConfig {
  baseUrl: URL;
  mappings: readonly GhlClientMapping[];
}

export function parseGhlConfig(
  environment: Record<string, string | undefined> = process.env,
): GhlConfig {
  const value = schema.parse(environment);
  return {
    baseUrl: value.GHL_API_BASE_URL,
    mappings: [
      {
        clientSlug: "tint-lab",
        clientName: "Tint Lab",
        locationId: value.GHL_TINT_LAB_LOCATION_ID,
        token: value.GHL_TINT_LAB_PRIVATE_INTEGRATION_TOKEN,
      },
      {
        clientSlug: "diamond-auto-restoration",
        clientName: "Diamond Auto Restoration",
        locationId: value.GHL_DIAMOND_LOCATION_ID,
        token: value.GHL_DIAMOND_PRIVATE_INTEGRATION_TOKEN,
      },
    ],
  };
}
