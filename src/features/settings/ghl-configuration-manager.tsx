"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { getFormString } from "~/lib/form-data";
import { api, type RouterOutputs } from "~/trpc/react";

type Configuration =
  RouterOutputs["settings"]["ghlConfigurationStatus"][number];

function GhlConfigurationDialog({ row }: { row: Configuration }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const save = api.settings.saveGhlConfiguration.useMutation({
    onSuccess: () => {
      setOpen(false);
      setError(null);
      router.refresh();
    },
    onError: (value) => setError(value.message),
  });
  const remove = api.settings.removeGhlConfiguration.useMutation({
    onSuccess: () => {
      setOpen(false);
      setError(null);
      router.refresh();
    },
    onError: (value) => setError(value.message),
  });
  const reset = api.settings.resetGhlIntegration.useMutation({
    onSuccess: () => {
      setOpen(false);
      setError(null);
      setResetConfirmation("");
      router.refresh();
    },
    onError: (value) => setError(value.message),
  });
  const isPending = save.isPending || remove.isPending || reset.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setError(null);
          setResetConfirmation("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={row.configured ? "outline" : "default"}>
          {row.configured ? "Edit GHL settings" : "Configure GHL"}
        </Button>
      </DialogTrigger>
      <DialogContent className="shadow-sage-floating max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[1.25rem]">
        <DialogHeader>
          <DialogTitle>GHL settings · {row.clientName}</DialogTitle>
          <DialogDescription>
            The Location ID and token are verified with GHL. Timezone is fetched
            automatically and cannot be entered manually.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            save.mutate({
              clientId: row.clientId,
              locationId: getFormString(data, "locationId"),
              token: getFormString(data, "token"),
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`ghl-location-${row.clientId}`}>
              GHL Location ID
            </Label>
            <Input
              id={`ghl-location-${row.clientId}`}
              name="locationId"
              defaultValue={row.locationId ?? ""}
              required
              maxLength={255}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ghl-token-${row.clientId}`}>
              Private Integration Token
            </Label>
            <Input
              id={`ghl-token-${row.clientId}`}
              name="token"
              type="password"
              required
              minLength={10}
              maxLength={5000}
              autoComplete="new-password"
              placeholder={
                row.tokenHint
                  ? `Enter token again to replace ${row.tokenHint}`
                  : "Enter private integration token"
              }
            />
            <p className="text-muted-foreground text-xs">
              Tokens are encrypted before storage and are never returned to the
              browser.
            </p>
          </div>
          {row.timezone ? (
            <p className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
              Current automatic timezone: <strong>{row.timezone}</strong>
            </p>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter className="sm:justify-between">
            {row.configured ? (
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove stored GHL credentials for ${row.clientName}? Existing synchronization history will be preserved.`,
                    )
                  ) {
                    remove.mutate({ clientId: row.clientId });
                  }
                }}
              >
                {remove.isPending ? "Removing…" : "Remove credentials"}
              </Button>
            ) : (
              <span />
            )}
            <Button disabled={isPending}>
              {save.isPending ? "Verifying…" : "Verify and save"}
            </Button>
          </DialogFooter>
          {row.hasGhlIntegration ? (
            <section className="border-destructive/40 bg-destructive/[0.04] space-y-3 rounded-lg border p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Reset GHL integration</p>
                <p className="text-muted-foreground text-xs leading-5">
                  Permanently deletes this client&apos;s stored GHL credentials
                  and synchronized contacts, opportunities, calendars,
                  appointments, and matching records. The client, non-GHL data,
                  and every other client remain unchanged. This cannot be
                  undone.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`ghl-reset-${row.clientId}`}>
                  Type <strong>{row.clientName}</strong> to confirm
                </Label>
                <Input
                  id={`ghl-reset-${row.clientId}`}
                  value={resetConfirmation}
                  onChange={(event) => setResetConfirmation(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                variant="destructive"
                disabled={isPending || resetConfirmation !== row.clientName}
                onClick={() => reset.mutate({ clientId: row.clientId })}
              >
                {reset.isPending
                  ? "Resetting…"
                  : "Delete GHL integration and history"}
              </Button>
            </section>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GhlConfigurationManager({ rows }: { rows: Configuration[] }) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[64rem]">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6">Client</TableHead>
            <TableHead>GHL settings</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Location ID</TableHead>
            <TableHead>Token</TableHead>
            <TableHead>Automatic timezone</TableHead>
            <TableHead className="pr-6">Last successful sync</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.clientId}>
              <TableCell className="pl-6 font-medium">
                {row.clientName}
              </TableCell>
              <TableCell>
                <GhlConfigurationDialog row={row} />
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    row.mappingState === "active" ? "default" : "secondary"
                  }
                  className="capitalize"
                >
                  {row.mappingState.replaceAll("_", " ")}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {row.locationId ?? "—"}
              </TableCell>
              <TableCell>{row.tokenHint ?? "—"}</TableCell>
              <TableCell>{row.timezone ?? "—"}</TableCell>
              <TableCell className="pr-6 tabular-nums">
                {row.lastSuccessfulSyncAt?.toISOString() ?? "Never"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
