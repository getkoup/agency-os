import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { PageHeader } from "~/features/dashboard/page-header";
import { UserManagement } from "~/features/management/user-management";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

export default async function UsersPage() {
  const user = await getAuthenticatedUser();
  if (user.role !== "owner") notFound();
  const [users, clients] = await Promise.all([
    api.management.users({ page: 1, pageSize: 25 }),
    api.management.clientOptions({ limit: 50 }),
  ]);
  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Owner settings"
        title="Users & Access"
        description="Manage roles, client memberships, account status, and password resets."
      />
      <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
        <CardHeader>
          <CardTitle className="tracking-tight">
            Users ({users.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <UserManagement rows={users.rows} clients={clients} />
        </CardContent>
      </Card>
    </div>
  );
}
