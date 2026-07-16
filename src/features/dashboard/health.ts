export type ClientHealthStatus =
  "healthy" | "watchlist" | "at_risk" | "critical";

export interface ClientHealthInput {
  currentCpl: number | null;
  priorCpl: number | null;
  capturedLeads: number;
  averageCapturedLeads: number | null;
  bookingConversion: number;
  averageBookingConversion: number | null;
}

export interface ClientHealth {
  score: number;
  status: ClientHealthStatus;
}

function cplTrendPoints(current: number | null, prior: number | null): number {
  if (
    current === null ||
    prior === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(prior) ||
    current < 0 ||
    prior <= 0
  ) {
    return 24;
  }
  const change = (current - prior) / prior;
  if (change <= -0.1) return 35;
  if (change <= 0.1) return 24;
  if (change <= 0.3) return 14;
  return 6;
}

function leadVolumePoints(leads: number, average: number | null): number {
  if (average === null || !Number.isFinite(average) || average <= 0) return 20;
  const ratio = leads / average;
  if (ratio >= 1) return 30;
  if (ratio >= 0.75) return 22;
  if (ratio >= 0.4) return 12;
  return 4;
}

function conversionPoints(current: number, average: number | null): number {
  if (average === null || !Number.isFinite(average) || average < 0) return 20;
  const difference = current - average;
  if (difference >= 0.05 - Number.EPSILON) return 35;
  if (difference >= -Number.EPSILON) return 24;
  if (difference >= -0.05 - Number.EPSILON) return 14;
  return 6;
}

export function calculateClientHealth(input: ClientHealthInput): ClientHealth {
  const score = Math.max(
    0,
    Math.min(
      100,
      cplTrendPoints(input.currentCpl, input.priorCpl) +
        leadVolumePoints(input.capturedLeads, input.averageCapturedLeads) +
        conversionPoints(
          input.bookingConversion,
          input.averageBookingConversion,
        ),
    ),
  );
  const status: ClientHealthStatus =
    score >= 75
      ? "healthy"
      : score >= 55
        ? "watchlist"
        : score >= 35
          ? "at_risk"
          : "critical";
  return { score, status };
}
