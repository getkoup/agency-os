import { AlertTriangle } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { formatReportingDateTime } from "~/features/dashboard/date-format";
import { EmptyState } from "~/features/dashboard/empty-state";
import { Pagination } from "~/features/dashboard/pagination";
import { type RouterOutputs } from "~/trpc/react";

type AttentionRow =
  RouterOutputs["salesCommissionsV2"]["report"]["attentionRows"][number];

const statusPresentation = {
  showed: { label: "Showed", className: "bg-emerald-500/15 text-emerald-800" },
  noshow: { label: "No-show", className: "bg-red-500/15 text-red-800" },
  confirmed: { label: "Confirmed", className: "bg-blue-500/15 text-blue-800" },
  new: { label: "New", className: "bg-sky-500/15 text-sky-800" },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground",
  },
  invalid: { label: "Invalid", className: "bg-muted text-muted-foreground" },
} as const;

const structureStatusLabels = {
  missing_description: "Missing description",
  legacy_description: "Legacy description",
  invalid_structure: "Incomplete new format",
  structured: "Complete new format",
} as const;

const reviewReasonLabels = {
  missing_description: "Missing description",
  legacy_description: "Legacy description",
  duplicate_field: "Duplicate field",
  missing_category: "Missing category",
  missing_service: "Missing service",
  missing_price: "Missing price",
  invalid_price: "Invalid price",
  unmatched_category: "Unmatched category",
  ambiguous_category: "Ambiguous category",
  missing_salesperson: "Missing salesperson",
  missing_commission_percentage: "Missing client percentage",
  past_unresolved_status: "Past unresolved",
} as const;

export function SalesCommissionV2AttentionTable({
  rows,
  total,
  searchParams,
  page,
}: {
  rows: AttentionRow[];
  total: number;
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
}) {
  return (
    <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
      <CardHeader className="border-border/70 border-b px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Bookings needing attention ({total})</CardTitle>
            <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
              Missing, legacy, or incomplete V2 descriptions are excluded from
              attributed revenue, missed revenue, and commission until fixed.
            </p>
          </div>
          <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-800">
            Excluded from financial totals
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        {rows.length ? (
          <Table className="min-w-[94rem]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-6">Booking / customer</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Salesperson</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Description status</TableHead>
                <TableHead className="min-w-64">Needs attention</TableHead>
                <TableHead className="min-w-80">Extracted details</TableHead>
                <TableHead className="pr-6">Financial treatment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="bg-amber-500/[0.05] hover:bg-amber-500/10"
                >
                  <TableCell className="pl-6 align-top whitespace-nowrap">
                    <p className="font-medium">
                      {row.contactName ?? "Unnamed contact"}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Booked{" "}
                      {formatReportingDateTime(row.bookedAt, row.timezone)}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Appointment{" "}
                      {formatReportingDateTime(row.startsAt, row.timezone)}
                    </p>
                  </TableCell>
                  <TableCell className="align-top font-medium">
                    {row.clientName}
                  </TableCell>
                  <TableCell className="align-top">
                    {row.salesperson?.name ?? "Unassigned / widget"}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge className={statusPresentation[row.status].className}>
                      {statusPresentation[row.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="outline" className="border-amber-500/40">
                      {structureStatusLabels[row.parseStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-1.5">
                      {row.reviewReasons.map((reason) => (
                        <Badge
                          key={reason}
                          variant="outline"
                          className="border-amber-500/40 text-amber-800"
                        >
                          {reviewReasonLabels[reason]}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="grid gap-1 text-xs">
                      <ExtractedField
                        label="Category"
                        value={row.fields.category}
                      />
                      <ExtractedField
                        label="Service"
                        value={row.fields.service}
                      />
                      <ExtractedField label="Price" value={row.fields.price} />
                      <ExtractedField
                        label="Lead source"
                        value={row.fields.leadSource}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="pr-6 align-top">
                    <Badge className="border-red-500/30 bg-red-500/10 text-red-800">
                      $0 counted
                    </Badge>
                    <p className="text-muted-foreground mt-2 max-w-56 text-xs">
                      {row.parsedPrice
                        ? `$${row.parsedPrice} detected but excluded`
                        : "No valid structured Price detected"}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState
              icon={AlertTriangle}
              title="No bookings need attention"
              description="Every booking matching these filters uses the complete V2 description format."
            />
          </div>
        )}
      </CardContent>
      <Pagination
        pathname="/dashboard/sales-commissions-v2"
        searchParams={searchParams}
        pageKey="salesCommissionV2Page"
        page={page}
        pageSize={25}
        total={total}
      />
    </Card>
  );
}

function ExtractedField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <p>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className={value ? "text-foreground" : "text-amber-800"}>
        {value ?? "Missing"}
      </span>
    </p>
  );
}
