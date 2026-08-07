"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { getFormString } from "~/lib/form-data";
import { api, type RouterOutputs } from "~/trpc/react";

type Assignment = RouterOutputs["assignments"]["list"]["rows"][number];
type AssignmentOptions = RouterOutputs["assignments"]["options"];

function nullableFormString(data: FormData, key: string): string | null {
  const value = getFormString(data, key).trim();
  return value || null;
}

export function AssignmentEditor({
  assignment,
  options,
  open,
  onOpenChange,
  onSaved,
}: {
  assignment: Assignment;
  options: AssignmentOptions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const update = api.assignments.update.useMutation({
    onSuccess: () => {
      setError(null);
      onOpenChange(false);
      onSaved();
    },
    onError: (cause) => setError(cause.message),
  });
  const clientOptions = assignment.clientName
    ? [
        assignment.clientName,
        ...options.clients.filter((client) => client !== assignment.clientName),
      ]
    : options.clients;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!update.isPending) {
          setError(null);
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit assignment</DialogTitle>
          <DialogDescription>
            Changes are written to the shared assignment workspace. Deletion is
            unavailable in Agency OS.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            const data = new FormData(event.currentTarget);
            const clientName = nullableFormString(data, "clientName");
            const statusDefinitionId = nullableFormString(
              data,
              "statusDefinitionId",
            );
            update.mutate({
              id: assignment.id,
              expectedUpdatedAt: assignment.updatedAt.toISOString(),
              videoName: getFormString(data, "videoName"),
              clientName: clientName === "none" ? null : clientName,
              status: assignment.status,
              statusDefinitionId:
                statusDefinitionId === "legacy" ? null : statusDefinitionId,
              uploadStatus: getFormString(
                data,
                "uploadStatus",
              ) as Assignment["uploadStatus"],
              dateAssigned: nullableFormString(data, "dateAssigned"),
              rawFilesUrl: nullableFormString(data, "rawFilesUrl"),
              finalFileUrl: nullableFormString(data, "finalFileUrl"),
              tagIds: data
                .getAll("tagIds")
                .filter((value): value is string => typeof value === "string"),
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`assignment-name-${assignment.id}`}>
              Assignment name
            </Label>
            <Input
              id={`assignment-name-${assignment.id}`}
              name="videoName"
              defaultValue={assignment.videoName}
              maxLength={500}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select
                name="clientName"
                defaultValue={assignment.clientName ?? "none"}
              >
                <SelectTrigger className="w-full" aria-label="Client">
                  <SelectValue placeholder="No client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clientOptions.map((client) => (
                    <SelectItem key={client} value={client}>
                      {client}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                name="statusDefinitionId"
                defaultValue={assignment.statusDefinitionId ?? "legacy"}
              >
                <SelectTrigger className="w-full" aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="legacy">
                    {assignment.status.replaceAll("_", " ")}
                  </SelectItem>
                  {options.statuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Upload status</Label>
              <Select
                name="uploadStatus"
                defaultValue={assignment.uploadStatus}
              >
                <SelectTrigger className="w-full" aria-label="Upload status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">Unknown</SelectItem>
                  <SelectItem value="not_uploaded">Not uploaded</SelectItem>
                  <SelectItem value="raw_uploaded">Raw uploaded</SelectItem>
                  <SelectItem value="final_uploaded">Final uploaded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`assignment-date-${assignment.id}`}>
                Assigned date
              </Label>
              <Input
                id={`assignment-date-${assignment.id}`}
                name="dateAssigned"
                type="date"
                defaultValue={assignment.dateAssigned ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`assignment-raw-${assignment.id}`}>
                Raw files URL
              </Label>
              <Input
                id={`assignment-raw-${assignment.id}`}
                name="rawFilesUrl"
                type="url"
                defaultValue={assignment.rawFilesUrl ?? ""}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`assignment-final-${assignment.id}`}>
                Final file URL
              </Label>
              <Input
                id={`assignment-final-${assignment.id}`}
                name="finalFileUrl"
                type="url"
                defaultValue={assignment.finalFileUrl ?? ""}
                placeholder="https://…"
              />
            </div>
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Tags</legend>
            <div className="flex flex-wrap gap-2">
              {options.tags.map((tag) => (
                <Label
                  key={tag.id}
                  className="border-border bg-muted/20 flex items-center gap-2 rounded-md border px-3 py-2 font-normal"
                >
                  <Checkbox
                    name="tagIds"
                    value={tag.id}
                    defaultChecked={assignment.tags.some(
                      (current) => current.id === tag.id,
                    )}
                  />
                  {tag.name}
                </Label>
              ))}
              {!options.tags.length ? (
                <span className="text-muted-foreground text-sm">
                  No assignment tags configured.
                </span>
              ) : null}
            </div>
          </fieldset>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={update.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
