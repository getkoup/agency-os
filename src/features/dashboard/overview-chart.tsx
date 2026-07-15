"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  Legend,
  ResponsiveContainer,
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
  const hasActivity = data.some(
    (row) =>
      row.spend !== 0 || row.platformLeads !== 0 || row.capturedLeads !== 0,
  );
  if (!hasActivity) {
    return (
      <div className="text-muted-foreground bg-secondary/25 grid h-72 place-items-center rounded-xl px-6 text-center text-sm sm:h-80">
        No spend or lead activity in this date range.
      </div>
    );
  }
  return (
    <ChartContainer
      className="h-72 w-full sm:h-80"
      config={{
        spend: { label: "Spend", color: "var(--chart-1)" },
        platformLeads: { label: "Platform leads", color: "var(--chart-2)" },
        capturedLeads: { label: "Captured leads", color: "var(--chart-3)" },
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} accessibilityLayer>
          <CartesianGrid vertical={false} strokeDasharray="4 6" />
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
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={7}
            wrapperStyle={{ paddingBottom: 16 }}
          />
          <Area
            yAxisId="money"
            dataKey="spend"
            type="monotone"
            fill="var(--color-spend)"
            fillOpacity={0.12}
            stroke="var(--color-spend)"
            strokeWidth={2.5}
          />
          <Line
            yAxisId="count"
            dataKey="platformLeads"
            type="monotone"
            stroke="var(--color-platformLeads)"
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            yAxisId="count"
            dataKey="capturedLeads"
            type="monotone"
            stroke="var(--color-capturedLeads)"
            strokeWidth={2.5}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
