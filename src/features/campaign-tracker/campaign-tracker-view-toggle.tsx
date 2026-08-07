import { LayoutList, Table2 } from "lucide-react";
import Link from "next/link";

import { Button } from "~/components/ui/button";
import {
  campaignTrackerViewHref,
  type CampaignTrackerView,
} from "~/features/campaign-tracker/view";

export function CampaignTrackerViewToggle({
  averageDays,
  date,
  query,
  view,
}: {
  averageDays: number;
  date: string;
  query: string;
  view: CampaignTrackerView;
}) {
  return (
    <div className="w-full space-y-2 xl:w-auto">
      <p className="text-foreground/75 px-0.5 text-xs font-medium">View</p>
      <div
        className="border-border bg-background flex h-10 w-full rounded-[0.5rem] border p-0.5"
        role="group"
        aria-label="Campaign Tracker view"
      >
        <Button
          asChild
          size="sm"
          variant={view === "grouped" ? "secondary" : "ghost"}
          className="flex-1 shadow-none"
        >
          <Link
            href={campaignTrackerViewHref({
              averageDays,
              date,
              query,
              view: "grouped",
            })}
            aria-current={view === "grouped" ? "page" : undefined}
          >
            <LayoutList aria-hidden="true" />
            Grouped
          </Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={view === "table" ? "secondary" : "ghost"}
          className="flex-1 shadow-none"
        >
          <Link
            href={campaignTrackerViewHref({
              averageDays,
              date,
              query,
              view: "table",
            })}
            aria-current={view === "table" ? "page" : undefined}
          >
            <Table2 aria-hidden="true" />
            Table
          </Link>
        </Button>
      </div>
    </div>
  );
}
