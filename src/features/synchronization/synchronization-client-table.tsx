import { DatabaseZap } from "lucide-react";

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
import { EmptyState } from "~/features/dashboard/empty-state";
import { type getSynchronizationClientStatuses } from "~/features/synchronization/server/queries";
import { SynchronizationRequestButton } from "~/features/synchronization/synchronization-request-button";
import { type UserRole } from "~/lib/roles";

type ClientStatus = Awaited<
  ReturnType<typeof getSynchronizationClientStatuses>
>[number];

type ProviderStatus = ClientStatus["ghl"];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function ProviderStatusCell({ provider }: { provider: ProviderStatus }) {
  if (!provider.configured) {
    return (
      <span className="text-muted-foreground text-xs">Not configured</span>
    );
  }
  return (
    <div className="space-y-1">
      <Badge
        variant={
          provider.status === "failed"
            ? "destructive"
            : provider.status === "succeeded"
              ? "secondary"
              : "outline"
        }
        className="capitalize"
      >
        {provider.status}
      </Badge>
      <p className="text-muted-foreground text-[0.7rem] tabular-nums">
        {provider.lastSucceededAt
          ? `${dateFormatter.format(provider.lastSucceededAt)} UTC`
          : "No successful sync yet"}
      </p>
    </div>
  );
}

function isActive(client: ClientStatus): boolean {
  return [client.ghl.status, client.windsor.status].some(
    (status) => status === "pending" || status === "running",
  );
}

export function SynchronizationClientTable({
  clients,
  role,
}: {
  clients: ClientStatus[];
  role: UserRole;
}) {
  const now = new Date();
  return (
    <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
      <CardHeader>
        <CardTitle className="tracking-tight">
          Client data freshness ({clients.length})
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Fresh Sync uses GHL appointments from 3 days ago through 30 days ahead
          and the latest 3 days from Windsor.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        {clients.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Client</TableHead>
                <TableHead>GoHighLevel</TableHead>
                <TableHead>Windsor</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => {
                const active = isActive(client);
                const coolingDown =
                  role === "client" &&
                  client.nextManualSyncAt !== null &&
                  client.nextManualSyncAt > now;
                const hasProvider =
                  client.ghl.configured || client.windsor.configured;
                return (
                  <TableRow key={client.id}>
                    <TableCell className="pl-6 font-medium">
                      {client.name}
                    </TableCell>
                    <TableCell>
                      <ProviderStatusCell provider={client.ghl} />
                    </TableCell>
                    <TableCell>
                      <ProviderStatusCell provider={client.windsor} />
                    </TableCell>
                    <TableCell className="pr-6">
                      <div className="flex flex-wrap justify-end gap-2">
                        <SynchronizationRequestButton
                          clientId={client.id}
                          mode="fresh"
                          size="xs"
                          disabled={active || coolingDown || !hasProvider}
                        />
                        {role === "owner" ? (
                          <SynchronizationRequestButton
                            clientId={client.id}
                            mode="full"
                            size="xs"
                            disabled={active || !hasProvider}
                          />
                        ) : null}
                      </div>
                      {coolingDown && client.nextManualSyncAt ? (
                        <p className="text-muted-foreground mt-1 text-right text-[0.7rem]">
                          Available{" "}
                          {dateFormatter.format(client.nextManualSyncAt)} UTC
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={DatabaseZap}
            title="No clients available"
            description="No active client memberships are available for synchronization."
          />
        )}
      </CardContent>
    </Card>
  );
}
