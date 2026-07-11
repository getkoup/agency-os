import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { LoginForm } from "~/features/auth/login-form";
import { auth } from "~/server/auth";
import { getCurrentUser } from "~/server/auth/current-user";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) {
    const user = await getCurrentUser(session.user.id).catch(() => null);
    if (user) redirect("/dashboard");
  }

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Agency OS</CardTitle>
          <CardDescription>Sign in with your seeded account.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
