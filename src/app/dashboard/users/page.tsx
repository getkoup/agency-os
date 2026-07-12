import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
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
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-primary text-sm font-medium">Owner settings</p>
        <h1 className="text-3xl font-semibold">Users &amp; Access</h1>
        <p className="text-muted-foreground">
          Manage roles, client memberships, status, and passwords.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Users ({users.total})</CardTitle>
        </CardHeader>
        <CardContent>
          <UserManagement rows={users.rows} clients={clients} />
        </CardContent>
      </Card>
    </div>
  );
}
