"use client";

import * as React from "react";
import { Tooltip } from "recharts";

import { cn } from "~/lib/utils";

export type ChartConfig = Record<
  string,
  { label?: React.ReactNode; color?: string }
>;

export function ChartContainer({
  config,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<"div">["children"];
}) {
  const variables = Object.fromEntries(
    Object.entries(config)
      .filter((entry) => entry[1].color)
      .map(([key, value]) => [`--color-${key}`, value.color]),
  );
  return (
    <div
      data-slot="chart"
      className={cn(
        "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50 text-xs",
        className,
      )}
      style={variables}
      {...props}
    >
      {children}
    </div>
  );
}

export const ChartTooltip = Tooltip;
