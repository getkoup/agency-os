"use client";

import { Link2, Save, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";

export function GlobalSalespersonNameControl({
  globalSalespersonId,
  displayName,
}: {
  globalSalespersonId: string;
  displayName: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const update = api.salesCommissions.updateGlobalSalesperson.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (result) => setError(result.message),
  });

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Global display name</Label>
      <div className="flex gap-2">
        <Input
          className="min-w-56"
          value={value}
          maxLength={255}
          placeholder="Optional Agency OS name"
          onChange={(event) => setValue(event.target.value)}
        />
        <Button
          size="icon"
          variant="outline"
          aria-label="Save global display name"
          disabled={update.isPending || (value.trim() || null) === displayName}
          onClick={() =>
            update.mutate({ globalSalespersonId, displayName: value })
          }
        >
          <Save aria-hidden="true" />
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

export function GlobalIdentityActions({
  salespersonId,
  currentGlobalSalespersonId,
  externalUserIdSuffix,
  sourceName,
  clientCount,
  canSeparate,
  targetOptions,
}: {
  salespersonId: string;
  currentGlobalSalespersonId: string;
  externalUserIdSuffix: string;
  sourceName: string;
  clientCount: number;
  canSeparate: boolean;
  targetOptions: Array<{
    id: string;
    name: string;
    clientCount: number;
    clientNames: string[];
  }>;
}) {
  const router = useRouter();
  const [linkOpen, setLinkOpen] = useState(false);
  const [separateOpen, setSeparateOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const link = api.salesCommissions.linkSalespersonToGlobal.useMutation({
    onSuccess: () => {
      setError(null);
      setLinkOpen(false);
      setTargetId("");
      router.refresh();
    },
    onError: (result) => setError(result.message),
  });
  const separate = api.salesCommissions.separateSalespersonIdentity.useMutation(
    {
      onSuccess: () => {
        setError(null);
        setSeparateOpen(false);
        router.refresh();
      },
      onError: (result) => setError(result.message),
    },
  );
  const normalizedSourceName = sourceName.trim().toLowerCase();
  const availableTargets = targetOptions
    .filter((target) => target.id !== currentGlobalSalespersonId)
    .sort((left, right) => {
      const leftMatches =
        left.name.trim().toLowerCase() === normalizedSourceName;
      const rightMatches =
        right.name.trim().toLowerCase() === normalizedSourceName;
      if (leftMatches !== rightMatches) return leftMatches ? -1 : 1;
      return left.name.localeCompare(right.name);
    });

  return (
    <div className="flex justify-end gap-2">
      <Dialog
        open={linkOpen}
        onOpenChange={(open) => {
          setLinkOpen(open);
          setError(null);
        }}
      >
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={!availableTargets.length}
          >
            <Link2 aria-hidden="true" /> Link elsewhere
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link GHL identity</DialogTitle>
            <DialogDescription>
              Move identity ••••{externalUserIdSuffix} and its {clientCount}{" "}
              client assignment{clientCount === 1 ? "" : "s"} under another
              global salesperson. Client reports and commission rates remain
              unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Global salesperson</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a salesperson" />
              </SelectTrigger>
              <SelectContent>
                {availableTargets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name.trim().toLowerCase() === normalizedSourceName
                      ? "Suggested · "
                      : ""}
                    {target.name} ·{" "}
                    {target.clientNames.slice(0, 2).join(", ") ||
                      `${target.clientCount} client${target.clientCount === 1 ? "" : "s"}`}
                    {target.clientNames.length > 2 ? "…" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter>
            <Button
              disabled={link.isPending || !targetId}
              onClick={() =>
                link.mutate({
                  salespersonId,
                  targetGlobalSalespersonId: targetId,
                })
              }
            >
              {link.isPending ? "Linking…" : "Link identity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canSeparate ? (
        <Dialog
          open={separateOpen}
          onOpenChange={(open) => {
            setSeparateOpen(open);
            setError(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost">
              <Unlink aria-hidden="true" /> Separate
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Separate GHL identity?</DialogTitle>
              <DialogDescription>
                Identity ••••{externalUserIdSuffix} will become its own global
                salesperson. Its {clientCount} client assignment
                {clientCount === 1 ? "" : "s"}, appointments, and rates will
                remain intact.
              </DialogDescription>
            </DialogHeader>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <DialogFooter>
              <Button
                variant="outline"
                disabled={separate.isPending}
                onClick={() => separate.mutate({ salespersonId })}
              >
                {separate.isPending ? "Separating…" : "Separate identity"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
