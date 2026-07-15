import { type LucideIcon } from "lucide-react";

import { Card } from "~/components/ui/card";
import { cn } from "~/lib/utils";

export function MetricCard({
  label,
  value,
  supporting,
  icon: Icon,
  highlighted = false,
}: {
  label: string;
  value: React.ReactNode;
  supporting: React.ReactNode;
  icon: LucideIcon;
  highlighted?: boolean;
}) {
  return (
    <Card
      className={cn(
        "shadow-sage border-border/80 gap-4 rounded-[1.2rem] p-5",
        highlighted && "bg-accent/55",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">
          {label}
        </p>
        <span className="bg-secondary text-secondary-foreground grid size-9 place-items-center rounded-full">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="text-3xl font-semibold tracking-[-0.04em] tabular-nums">
        {value}
      </p>
      <div className="text-muted-foreground text-sm">{supporting}</div>
    </Card>
  );
}
