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
        "group/metric gap-4 p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        highlighted && "border-primary/15 bg-accent/55",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">
          {label}
        </p>
        <span className="bg-secondary text-secondary-foreground group-hover/metric:bg-primary group-hover/metric:text-primary-foreground grid size-9 place-items-center rounded-xl transition-colors">
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
      </div>
      <p className="font-heading text-[2.6rem] leading-none font-medium tracking-[-0.04em] tabular-nums">
        {value}
      </p>
      <div className="text-muted-foreground text-sm">{supporting}</div>
    </Card>
  );
}
