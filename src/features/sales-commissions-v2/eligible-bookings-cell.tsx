const eligibleStatusPresentation = [
  ["showed", "showed"],
  ["confirmed", "confirmed"],
  ["new", "new"],
  ["noshow", "no-show"],
  ["cancelled", "cancelled"],
  ["invalid", "invalid"],
] as const;

type EligibleStatus = (typeof eligibleStatusPresentation)[number][0];

export function EligibleBookingsCell({
  summary,
}: {
  summary: {
    eligibleBookings: number;
    eligibleByStatus: Record<EligibleStatus, number>;
  };
}) {
  const breakdown: string[] = [];
  for (const [status, label] of eligibleStatusPresentation) {
    const count = summary.eligibleByStatus[status];
    if (count > 0) breakdown.push(`${count} ${label}`);
  }

  return (
    <div className="whitespace-nowrap">
      <p className="font-medium tabular-nums">{summary.eligibleBookings}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {breakdown.join(" · ") || "No eligible bookings"}
      </p>
    </div>
  );
}
