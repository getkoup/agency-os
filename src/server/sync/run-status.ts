import "server-only";

export const ALL_CLIENT_SYNC_STALE_AFTER_MS = 15 * 60 * 1000;

export function isAllClientSyncRunActive(
  run: { status: string; heartbeatAt: Date },
  now: Date = new Date(),
): boolean {
  return (
    run.status === "running" &&
    run.heartbeatAt.getTime() >= now.getTime() - ALL_CLIENT_SYNC_STALE_AFTER_MS
  );
}
