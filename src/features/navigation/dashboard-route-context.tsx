"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";

import {
  DASHBOARD_DESTINATIONS,
  isDestinationActive,
} from "~/features/navigation/dashboard-destinations";

export function DashboardRouteContext() {
  const pathname = usePathname();
  const destination = DASHBOARD_DESTINATIONS.find((item) =>
    isDestinationActive(pathname, item.href),
  );

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-sm">
      <span className="text-muted-foreground hidden sm:inline">Agency OS</span>
      <ChevronRight className="text-muted-foreground hidden size-3.5 sm:block" />
      <span className="truncate font-medium">
        {destination?.label ?? "Dashboard"}
      </span>
    </div>
  );
}
