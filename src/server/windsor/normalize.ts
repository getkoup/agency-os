import { z } from "zod";

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

export function normalizeSuggestionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseNullableInteger(value: unknown): number | null {
  const parsed = parseNullableNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

const explicitOffsetTimestamp = z
  .string()
  .regex(/(?:Z|[+-]\d{2}:?\d{2})$/)
  .transform((value, context) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      context.addIssue({ code: "custom", message: "Invalid timestamp" });
      return z.NEVER;
    }
    return date;
  });

export function parseOccurredAt(value: unknown): Date {
  return explicitOffsetTimestamp.parse(value);
}

export function chunkValues<T>(values: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error("Chunk size must be a positive integer");
  }
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function parseConnectorAccountId(value: string): {
  connector: "facebook" | "facebook_leads";
  externalAccountId: string;
} {
  const match = /^(facebook|facebook_leads)__(.+)$/.exec(value);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Unsupported Windsor connector account: ${value}`);
  }
  return {
    connector: match[1] as "facebook" | "facebook_leads",
    externalAccountId: match[2],
  };
}
