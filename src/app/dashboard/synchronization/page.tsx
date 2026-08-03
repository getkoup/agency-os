import { notFound } from "next/navigation";

import { PageHeader } from "~/features/dashboard/page-header";
import { SynchronizationClientTable } from "~/features/synchronization/synchronization-client-table";
import { SynchronizationRequestButton } from "~/features/synchronization/synchronization-request-button";
import { SynchronizationRunHistory } from "~/features/synchronization/synchronization-run-history";
import { SynchronizationStatusRefresher } from "~/features/synchronization/synchronization-status-refresher";
import { WindsorRunHistory } from "~/features/synchronization/windsor-run-history";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

export default async function SynchronizationPage() {
  const user = await getAuthenticatedUser();
  if (user.role === "manager") notFound();
  const clientStatuses = await api.synchronization.clientStatuses();
  const activeClientIds = new Set(
    clientStatuses.flatMap((client) =>
      client.ghl.status === "pending" ||
      client.ghl.status === "running" ||
      client.windsor.status === "pending" ||
      client.windsor.status === "running"
        ? [client.id]
        : [],
    ),
  );
  const anyClientActive = activeClientIds.size > 0;

  if (user.role === "client") {
    return (
      <div className="mx-auto max-w-[96rem] space-y-7">
        <SynchronizationStatusRefresher isActive={anyClientActive} />
        <PageHeader
          eyebrow="Data freshness"
          title="Data Sync"
          description="Refresh the recent GHL and Windsor data for clients assigned to your account. Requests are limited to once every 15 minutes."
        />
        <SynchronizationClientTable clients={clientStatuses} role={user.role} />
      </div>
    );
  }

  const [windsorRuns, synchronizationRuns] = await Promise.all([
    api.dashboard.syncRuns({ page: 1, pageSize: 25 }),
    api.synchronization.history(),
  ]);
  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <SynchronizationStatusRefresher isActive={anyClientActive} />
      <PageHeader
        eyebrow="Operations"
        title="Synchronization"
        description="Fresh data is queued hourly. Fresh Sync uses a smaller recent window; owner-only Full Sync performs the complete configured reconciliation."
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <SynchronizationRequestButton
              mode="fresh"
              label="Fresh sync all"
              variant="default"
              disabled={anyClientActive}
            />
            {user.role === "owner" ? (
              <SynchronizationRequestButton
                mode="full"
                label="Full sync all"
                disabled={anyClientActive}
              />
            ) : null}
          </div>
        }
      />
      <SynchronizationClientTable clients={clientStatuses} role={user.role} />
      <SynchronizationRunHistory
        activeClientIds={activeClientIds}
        runs={synchronizationRuns}
      />
      <WindsorRunHistory runs={windsorRuns} />
    </div>
  );
}
