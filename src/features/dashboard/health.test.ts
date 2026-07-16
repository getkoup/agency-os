import { describe, expect, it } from "vitest";

import { calculateClientHealth } from "~/features/dashboard/health";

const defaults = {
  currentCpl: null,
  priorCpl: null,
  capturedLeads: 0,
  averageCapturedLeads: null,
  bookingConversion: 0,
  averageBookingConversion: null,
};

describe("calculateClientHealth", () => {
  it.each([
    [90, 100, 75],
    [110, 100, 64],
    [130, 100, 54],
    [131, 100, 46],
    [null, 100, 64],
  ] as const)("scores CPL %s versus %s", (currentCpl, priorCpl, score) => {
    expect(
      calculateClientHealth({ ...defaults, currentCpl, priorCpl }).score,
    ).toBe(score);
  });

  it.each([
    [100, 100, 74],
    [75, 100, 66],
    [40, 100, 56],
    [39, 100, 48],
    [0, null, 64],
  ] as const)(
    "scores lead volume %s versus %s",
    (capturedLeads, average, score) => {
      expect(
        calculateClientHealth({
          ...defaults,
          capturedLeads,
          averageCapturedLeads: average,
        }).score,
      ).toBe(score);
    },
  );

  it.each([
    [0.15, 0.1, 79],
    [0.1, 0.1, 68],
    [0.05, 0.1, 58],
    [0.049, 0.1, 50],
    [0, null, 64],
  ] as const)(
    "scores conversion %s versus %s",
    (conversion, average, score) => {
      expect(
        calculateClientHealth({
          ...defaults,
          bookingConversion: conversion,
          averageBookingConversion: average,
        }).score,
      ).toBe(score);
    },
  );

  it("labels healthy and watchlist scores at their reachable boundaries", () => {
    expect(
      calculateClientHealth({ ...defaults, currentCpl: 90, priorCpl: 100 }),
    ).toEqual({ score: 75, status: "healthy" });
    expect(
      calculateClientHealth({
        ...defaults,
        currentCpl: 130,
        priorCpl: 100,
        averageCapturedLeads: 100,
        capturedLeads: 75,
        averageBookingConversion: null,
        bookingConversion: 0,
      }),
    ).toEqual({ score: 56, status: "watchlist" });
  });

  it("labels lower scores at risk and critical", () => {
    expect(
      calculateClientHealth({ ...defaults, currentCpl: 131, priorCpl: 100 }),
    ).toMatchObject({ score: 46, status: "at_risk" });
    expect(
      calculateClientHealth({
        currentCpl: 131,
        priorCpl: 100,
        capturedLeads: 0,
        averageCapturedLeads: 100,
        bookingConversion: 0,
        averageBookingConversion: 0.1,
      }),
    ).toEqual({ score: 16, status: "critical" });
  });
});
