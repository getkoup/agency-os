import { BarChart3, ShieldCheck, Users } from "lucide-react";
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
    <main className="grid min-h-screen bg-slate-950 lg:grid-cols-2">
      <section className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,.35),transparent_50%)]" />
        <div className="relative text-xl font-semibold">Agency OS</div>
        <div className="relative max-w-xl space-y-8">
          <h1 className="text-5xl font-semibold tracking-tight">
            One clear view of every client campaign.
          </h1>
          <div className="grid gap-4 text-sm text-slate-300">
            <p className="flex items-center gap-3">
              <BarChart3 className="text-indigo-400" /> Cross-account
              performance and lead reporting.
            </p>
            <p className="flex items-center gap-3">
              <Users className="text-emerald-400" /> Role-scoped workspaces for
              your agency and clients.
            </p>
            <p className="flex items-center gap-3">
              <ShieldCheck className="text-amber-400" /> Server-enforced access
              and account ownership.
            </p>
          </div>
        </div>
        <p className="relative text-sm text-slate-400">
          Built for focused agency operations.
        </p>
      </section>
      <section className="bg-background flex items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>
              Sign in to your Agency OS workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
