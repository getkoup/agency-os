"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pencil,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { AssignmentEditor } from "~/features/assignments/assignment-editor";
import { api, type RouterInputs, type RouterOutputs } from "~/trpc/react";
import { cn } from "~/lib/utils";

type AssignmentList = RouterOutputs["assignments"]["list"];
type Assignment = AssignmentList["rows"][number];
type AssignmentOptions = RouterOutputs["assignments"]["options"];
type SortKey = NonNullable<RouterInputs["assignments"]["list"]["sort"]>;
type UpdateChanges = Omit<
  RouterInputs["assignments"]["update"],
  "id" | "expectedUpdatedAt"
>;

const uploadLabels: Record<Assignment["uploadStatus"], string> = {
  unknown: "Unknown",
  not_uploaded: "Not uploaded",
  raw_uploaded: "Raw uploaded",
  final_uploaded: "Final uploaded",
};
const statusColorClasses: Record<string, string> = {
  slate: "border-slate-200 bg-slate-100 text-slate-800",
  zinc: "border-zinc-200 bg-zinc-100 text-zinc-800",
  blue: "border-blue-200 bg-blue-100 text-blue-800",
  violet: "border-violet-200 bg-violet-100 text-violet-800",
  amber: "border-amber-200 bg-amber-100 text-amber-800",
  emerald: "border-emerald-200 bg-emerald-100 text-emerald-800",
  rose: "border-rose-200 bg-rose-100 text-rose-800",
};

const uploadColorClasses: Record<Assignment["uploadStatus"], string> = {
  unknown: "border-slate-200 bg-slate-100 text-slate-800",
  not_uploaded: "border-rose-200 bg-rose-100 text-rose-800",
  raw_uploaded: "border-blue-200 bg-blue-100 text-blue-800",
  final_uploaded: "border-emerald-200 bg-emerald-100 text-emerald-800",
};

function getStatusColorClass(row: Assignment): string {
  if (row.statusColor) {
    return statusColorClasses[row.statusColor] ?? statusColorClasses.slate!;
  }
  if (row.status === "done") return statusColorClasses.emerald!;
  if (row.status === "blocked") return statusColorClasses.rose!;
  if (row.status === "review") return statusColorClasses.amber!;
  if (row.status === "in_progress") return statusColorClasses.blue!;
  return statusColorClasses.slate!;
}

export function AssignmentDashboard({
  initial,
  options,
}: {
  initial: AssignmentList;
  options: AssignmentOptions;
}) {
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [statusDefinitionId, setStatusDefinitionId] = useState("");
  const [uploadStatus, setUploadStatus] = useState<
    Assignment["uploadStatus"] | ""
  >("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("updated");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchText.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const input = {
    page,
    pageSize: 25,
    search: search || undefined,
    statusDefinitionId: statusDefinitionId || undefined,
    uploadStatus: uploadStatus || undefined,
    reviewOnly,
    sort,
    direction,
  } satisfies RouterInputs["assignments"]["list"];
  const isInitialQuery =
    page === 1 &&
    !search &&
    !statusDefinitionId &&
    !uploadStatus &&
    !reviewOnly &&
    sort === "updated" &&
    direction === "desc";
  const list = api.assignments.list.useQuery(input, {
    initialData: isInitialQuery ? initial : undefined,
    refetchInterval: 30_000,
  });
  const data = list.data ?? { rows: [], total: 0 };
  const pages = Math.max(1, Math.ceil(data.total / 25));
  const update = api.assignments.update.useMutation({
    onSuccess: async () => {
      setUpdateError(null);
      await list.refetch();
    },
    onError: (error) => setUpdateError(error.message),
  });

  function updateRow(row: Assignment, changes: UpdateChanges) {
    setUpdateError(null);
    update.mutate({
      id: row.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
      ...changes,
    });
  }

  function changeSort(nextSort: SortKey) {
    setPage(1);
    if (nextSort === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(nextSort);
      setDirection("asc");
    }
  }

  function sortButton(key: SortKey, label: string) {
    const Icon =
      sort === key ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 whitespace-nowrap"
        onClick={() => changeSort(key)}
      >
        {label}
        <Icon className="text-muted-foreground size-3.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="space-y-5">
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Assignment workspace overview"
      >
        <MetricCard
          icon={ArrowUpDown}
          value={data.total.toLocaleString()}
          label="Matching assignments"
        />
        <MetricCard
          icon={Building2}
          value={options.clients.length.toLocaleString()}
          label="Available clients"
        />
        <button
          type="button"
          className="text-left"
          onClick={() => {
            setPage(1);
            setReviewOnly((current) => !current);
          }}
        >
          <Card
            className={
              reviewOnly
                ? "border-primary bg-primary/5 h-full"
                : "hover:border-primary/40 h-full transition-colors"
            }
          >
            <CardContent className="flex items-center gap-3 px-4 py-0">
              <span className="bg-secondary text-secondary-foreground grid size-10 place-items-center rounded-lg">
                <AlertCircle className="size-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-semibold">Review queue</span>
                <span className="text-muted-foreground text-xs">
                  {reviewOnly ? "Showing flagged records" : "View data flags"}
                </span>
              </span>
            </CardContent>
          </Card>
        </button>
      </section>

      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <div className="border-border/70 bg-card/70 grid gap-3 border-b p-4 md:grid-cols-[minmax(16rem,1fr)_12rem_12rem]">
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search assignments, clients, statuses, tags, or files"
              aria-label="Search assignments"
              className="pl-9"
            />
          </div>
          <Select
            value={statusDefinitionId || "all"}
            onValueChange={(value) => {
              setPage(1);
              setStatusDefinitionId(value === "all" ? "" : value);
            }}
          >
            <SelectTrigger className="w-full" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {options.statuses.map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  {status.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={uploadStatus || "all"}
            onValueChange={(value) => {
              setPage(1);
              setUploadStatus(
                value === "all" ? "" : (value as Assignment["uploadStatus"]),
              );
            }}
          >
            <SelectTrigger
              className="w-full"
              aria-label="Filter by upload status"
            >
              <SelectValue placeholder="All upload statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All upload statuses</SelectItem>
              {Object.entries(uploadLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {updateError ? (
          <p
            className="bg-destructive/8 text-destructive border-border border-b px-4 py-3 text-sm"
            role="alert"
          >
            {updateError}
          </p>
        ) : null}

        <Table
          aria-label="Assignments"
          className="min-w-[72rem]"
          containerClassName="max-h-[68vh] overflow-auto"
        >
          <TableHeader className="[&_th]:bg-muted [&_th]:sticky [&_th]:top-0 [&_th]:z-10">
            <TableRow>
              <TableHead className="min-w-72 pl-5">
                {sortButton("videoName", "Assignment")}
              </TableHead>
              <TableHead className="min-w-48">
                {sortButton("clientName", "Client")}
              </TableHead>
              <TableHead className="w-44">
                {sortButton("status", "Status")}
              </TableHead>
              <TableHead className="w-44">
                {sortButton("uploadStatus", "Upload status")}
              </TableHead>
              <TableHead className="w-36">
                {sortButton("dateAssigned", "Assigned")}
              </TableHead>
              <TableHead className="w-36">
                {sortButton("files", "Files")}
              </TableHead>
              <TableHead className="w-24 pr-5 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="pl-5 align-top">
                  <button
                    type="button"
                    className="hover:text-primary text-left font-medium"
                    onClick={() => setEditing(row)}
                  >
                    {row.videoName}
                  </button>
                  {row.tags.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {row.tags.map((tag) => (
                        <Badge key={tag.id} variant="secondary">
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="align-top">
                  {row.clientName ?? "—"}
                </TableCell>
                <TableCell className="align-top">
                  <Select
                    value={row.statusDefinitionId ?? "legacy"}
                    disabled={update.isPending}
                    onValueChange={(value) =>
                      updateRow(row, {
                        statusDefinitionId: value === "legacy" ? null : value,
                      })
                    }
                  >
                    <SelectTrigger
                      className={cn("w-40", getStatusColorClass(row))}
                      aria-label={`Status for ${row.videoName}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="legacy">
                        {row.status.replaceAll("_", " ")}
                      </SelectItem>
                      {options.statuses.map((status) => (
                        <SelectItem key={status.id} value={status.id}>
                          {status.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="align-top">
                  <Select
                    value={row.uploadStatus}
                    disabled={update.isPending}
                    onValueChange={(value) =>
                      updateRow(row, {
                        uploadStatus: value as Assignment["uploadStatus"],
                      })
                    }
                  >
                    <SelectTrigger
                      className={cn(
                        "w-40",
                        uploadColorClasses[row.uploadStatus],
                      )}
                      aria-label={`Upload status for ${row.videoName}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(uploadLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="align-top tabular-nums">
                  {row.dateAssigned ?? "—"}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap gap-2">
                    {row.rawFilesUrl ? (
                      <AssignmentLink href={row.rawFilesUrl} label="Raw" />
                    ) : null}
                    {row.finalFileUrl ? (
                      <AssignmentLink href={row.finalFileUrl} label="Final" />
                    ) : null}
                    {row.notionPageUrl ? (
                      <AssignmentLink href={row.notionPageUrl} label="Source" />
                    ) : null}
                    {!row.rawFilesUrl && !row.finalFileUrl && !row.notionPageUrl
                      ? "—"
                      : null}
                  </div>
                </TableCell>
                <TableCell className="pr-5 text-right align-top">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(row)}
                  >
                    <Pencil aria-hidden="true" />
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {!data.rows.length && !list.isFetching ? (
          <div className="px-6 py-12 text-center">
            <p className="font-medium">No assignments found</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Change the search or filters and try again.
            </p>
          </div>
        ) : null}

        <div className="border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
          <span className="text-muted-foreground text-sm">
            {data.total
              ? `Showing ${(page - 1) * 25 + 1}–${Math.min(page * 25, data.total)} of ${data.total.toLocaleString()}`
              : "No assignments"}
            {list.isFetching ? " · Refreshing…" : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={page <= 1 || list.isFetching}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft aria-hidden="true" />
              <span className="sr-only">Previous page</span>
            </Button>
            <span className="min-w-20 text-center text-sm font-medium">
              {page} / {pages}
            </span>
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={page >= pages || list.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              <ChevronRight aria-hidden="true" />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      </Card>

      {editing ? (
        <AssignmentEditor
          key={`${editing.id}:${editing.updatedAt.toISOString()}`}
          assignment={editing}
          options={options}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={async () => {
            setEditing(null);
            await list.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 px-4 py-0">
        <span className="bg-secondary text-secondary-foreground grid size-10 place-items-center rounded-lg">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-xl font-semibold tabular-nums">
            {value}
          </span>
          <span className="text-muted-foreground text-xs">{label}</span>
        </span>
      </CardContent>
    </Card>
  );
}

function AssignmentLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
    >
      {label}
      <ExternalLink className="size-3" aria-hidden="true" />
    </a>
  );
}
