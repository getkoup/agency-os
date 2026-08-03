export const HOURLY_SYNC_INTERVAL_MS = 60 * 60 * 1_000;
export const CLIENT_SYNC_COOLDOWN_MS = 15 * 60 * 1_000;
export const FRESH_SYNC_HISTORY_DAYS = 3;
export const FRESH_SYNC_FUTURE_DAYS = 30;
export const FULL_SYNC_HISTORY_DAYS = 90;
export const FULL_SYNC_FUTURE_DAYS = 180;
export const FRESH_WINDSOR_LOOKBACK_DAYS = 3;
export const FULL_WINDSOR_LOOKBACK_DAYS = 8;

const DAY_MS = 24 * 60 * 60 * 1_000;

export type SynchronizationMode = "fresh" | "full";

export function ghlAppointmentRange(
  runStartedAt: Date,
  mode: SynchronizationMode,
): { floor: Date; through: Date } {
  const historyDays =
    mode === "fresh" ? FRESH_SYNC_HISTORY_DAYS : FULL_SYNC_HISTORY_DAYS;
  const futureDays =
    mode === "fresh" ? FRESH_SYNC_FUTURE_DAYS : FULL_SYNC_FUTURE_DAYS;
  return {
    floor: new Date(runStartedAt.getTime() - historyDays * DAY_MS),
    through: new Date(runStartedAt.getTime() + futureDays * DAY_MS),
  };
}

export function ghlOpportunityFloor(input: {
  mode: SynchronizationMode;
  runStartedAt: Date;
  syncFromAt: Date;
}): Date {
  if (input.mode === "full") return input.syncFromAt;
  const freshFloor = new Date(
    input.runStartedAt.getTime() - FRESH_SYNC_HISTORY_DAYS * DAY_MS,
  );
  return freshFloor < input.syncFromAt ? input.syncFromAt : freshFloor;
}

export function windsorLookbackDays(mode: SynchronizationMode): number {
  return mode === "fresh"
    ? FRESH_WINDSOR_LOOKBACK_DAYS
    : FULL_WINDSOR_LOOKBACK_DAYS;
}
