import { timingSafeEqual } from "node:crypto";

import { env } from "~/env";
import { processPendingSyncTargets } from "~/server/sync/sync-worker";

export const runtime = "nodejs";
export const maxDuration = 300;

function secretsMatch(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}

export async function GET(request: Request): Promise<Response> {
  if (!env.CRON_SECRET) {
    return Response.json(
      { error: "Synchronization worker is not configured" },
      { status: 503 },
    );
  }
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!secretsMatch(token, env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processPendingSyncTargets();
    return Response.json(result);
  } catch (error) {
    console.error("Synchronization worker failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Unknown synchronization error",
    });
    return Response.json(
      { error: "Synchronization worker failed" },
      { status: 500 },
    );
  }
}
