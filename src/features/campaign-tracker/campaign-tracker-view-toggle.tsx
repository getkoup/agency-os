import { LayoutList, Table2 } from "lucide-react";
import Link from "next/link";

import { Button } from "~/components/ui/button";
import {
  campaignTrackerViewHref,
  type CampaignTrackerView,
} from "~/features/campaign-tracker/view";

export function CampaignTrackerViewToggle({
  date,
  view,
}: {
  date: string;
  view: CampaignTrackerView;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">View</p>
      <div
        className="border-border bg-background flex rounded-md border p-0.5"
        role="group"
        aria-label="Campaign Tracker view"
      >
        <Button
          asChild
          size="sm"
          variant={view === "grouped" ? "secondary" : "ghost"}
          className="shadow-none"
        >
          <Link
            href={campaignTrackerViewHref({ date, view: "grouped" })}
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
          className="shadow-none"
        >
          <Link
            href={campaignTrackerViewHref({ date, view: "table" })}
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
