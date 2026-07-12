"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import { ChartContainer, ChartTooltip } from "~/components/ui/chart";

export function OverviewChart({
  rows,
}: {
  rows: Array<{
    date: string;
    spend: string;
    platformLeads: number;
    capturedLeads: number;
  }>;
}) {
  const data = rows.map((row) => ({ ...row, spend: Number(row.spend) }));
  return (
    <ChartContainer
      className="h-80 w-full"
      config={{
        spend: { label: "Spend", color: "var(--chart-1)" },
        platformLeads: { label: "Platform leads", color: "var(--chart-2)" },
        capturedLeads: { label: "Captured leads", color: "var(--chart-3)" },
      }}
    >
      <ComposedChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          minTickGap={28}
        />
        <YAxis
          yAxisId="money"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => `$${value}`}
        />
        <YAxis
          yAxisId="count"
          orientation="right"
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <ChartTooltip />
        <Area
          yAxisId="money"
          dataKey="spend"
          type="monotone"
          fill="var(--color-spend)"
          fillOpacity={0.18}
          stroke="var(--color-spend)"
        />
        <Line
          yAxisId="count"
          dataKey="platformLeads"
          type="monotone"
          stroke="var(--color-platformLeads)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="count"
          dataKey="capturedLeads"
          type="monotone"
          stroke="var(--color-capturedLeads)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
