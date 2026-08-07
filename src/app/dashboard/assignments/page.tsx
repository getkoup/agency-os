import { notFound } from "next/navigation";

import { Badge } from "~/components/ui/badge";
import { AssignmentDashboard } from "~/features/assignments/assignment-dashboard";
import { PageHeader } from "~/features/dashboard/page-header";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

export default async function AssignmentsPage() {
  const user = await getAuthenticatedUser();
  if (user.role === "client") notFound();

  const [initial, options] = await Promise.all([
    api.assignments.list({
      page: 1,
      pageSize: 25,
      reviewOnly: false,
      sort: "updated",
      direction: "desc",
    }),
    api.assignments.options(),
  ]);

  return (
    <div className="mx-auto max-w-[112rem] space-y-6">
      <PageHeader
        eyebrow="Creative operations"
        title="Assignments"
        description="Review and update the shared assignment workspace. Changes appear in both Agency OS and Agent OS."
        meta={
          <Badge variant="secondary">View and edit · deletion disabled</Badge>
        }
      />
      <AssignmentDashboard initial={initial} options={options} />
    </div>
  );
}
