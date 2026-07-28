import {
  ArrowUpRight,
  BarChart3,
  CalendarCheck2,
  Check,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { redirect } from "next/navigation";

import { LoginForm } from "~/features/auth/login-form";
import { auth } from "~/server/auth";
import { getCurrentUser } from "~/server/auth/current-user";

const capabilities = [
  "Campaign performance at a glance",
  "Lead and booking attribution",
  "Client goals and sales tracking",
];

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) {
    const user = await getCurrentUser(session.user.id).catch(() => null);
    if (user) redirect("/dashboard");
  }

  return (
    <main className="bg-background relative min-h-screen overflow-hidden lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(30rem,0.92fr)]">
      <section className="bg-sidebar text-sidebar-foreground relative hidden min-h-screen overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
        <div className="pointer-events-none absolute inset-0">
          <div className="bg-sidebar-primary/15 absolute -top-44 -left-36 size-[32rem] rounded-full blur-3xl" />
          <div className="bg-chart-5/15 absolute right-[-10rem] bottom-[-9rem] size-[30rem] rounded-full blur-3xl" />
          <div className="absolute inset-0 [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:44px_44px] opacity-[0.06]" />
        </div>

        <div className="relative flex items-center gap-3">
          <div className="bg-sidebar-primary text-sidebar-primary-foreground grid size-10 place-items-center rounded-xl shadow-lg">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold tracking-tight">Agency OS</p>
            <p className="text-sidebar-foreground/55 text-[0.6875rem] font-medium tracking-[0.18em] uppercase">
              Operating intelligence
            </p>
          </div>
        </div>

        <div className="relative max-w-2xl py-16">
          <div className="border-sidebar-border bg-sidebar-accent/45 mb-7 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
            <span className="bg-sidebar-primary size-1.5 rounded-full" />
            One workspace. Every client signal.
          </div>
          <h1 className="font-heading max-w-xl text-5xl leading-[0.98] tracking-[-0.035em] text-balance xl:text-6xl">
            Make every client decision with clarity.
          </h1>
          <p className="text-sidebar-foreground/68 mt-6 max-w-lg text-base leading-7">
            Bring performance, leads, bookings, and sales goals into one focused
            operating view built for modern agencies.
          </p>

          <div className="mt-10 grid gap-3">
            {capabilities.map((capability) => (
              <div
                key={capability}
                className="text-sidebar-foreground/82 flex items-center gap-3 text-sm"
              >
                <span className="bg-sidebar-primary/15 text-sidebar-primary grid size-6 place-items-center rounded-full">
                  <Check className="size-3.5" strokeWidth={2.5} />
                </span>
                {capability}
              </div>
            ))}
          </div>
        </div>

        <div className="relative grid grid-cols-3 gap-3">
          <div className="border-sidebar-border bg-sidebar-accent/35 rounded-2xl border p-4 backdrop-blur-sm">
            <BarChart3 className="text-sidebar-primary size-5" />
            <p className="mt-5 text-sm font-semibold">Performance</p>
            <p className="text-sidebar-foreground/50 mt-1 text-xs">
              Cross-account clarity
            </p>
          </div>
          <div className="border-sidebar-border bg-sidebar-accent/35 rounded-2xl border p-4 backdrop-blur-sm">
            <CalendarCheck2 className="text-chart-5 size-5" />
            <p className="mt-5 text-sm font-semibold">Bookings</p>
            <p className="text-sidebar-foreground/50 mt-1 text-xs">
              Calendar attribution
            </p>
          </div>
          <div className="border-sidebar-border bg-sidebar-accent/35 rounded-2xl border p-4 backdrop-blur-sm">
            <ShieldCheck className="text-chart-4 size-5" />
            <p className="mt-5 text-sm font-semibold">Access</p>
            <p className="text-sidebar-foreground/50 mt-1 text-xs">
              Role-scoped controls
            </p>
          </div>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="bg-primary/8 pointer-events-none absolute top-[-8rem] right-[-8rem] size-80 rounded-full blur-3xl lg:hidden" />
        <div className="relative w-full max-w-[27rem]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="bg-primary text-primary-foreground grid size-10 place-items-center rounded-xl shadow-md">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="font-semibold tracking-tight">Agency OS</p>
              <p className="text-muted-foreground text-[0.6875rem] font-medium tracking-[0.16em] uppercase">
                Operating intelligence
              </p>
            </div>
          </div>

          <div className="mb-8">
            <p className="text-primary mb-3 text-xs font-semibold tracking-[0.16em] uppercase">
              Welcome back
            </p>
            <h2 className="font-heading text-4xl leading-none tracking-[-0.025em] sm:text-[2.75rem]">
              Sign in to your workspace
            </h2>
            <p className="text-muted-foreground mt-4 leading-6">
              Enter your credentials to continue to your agency dashboard.
            </p>
          </div>

          <div className="border-border/80 bg-card/80 shadow-sage-floating rounded-[1.5rem] border p-5 backdrop-blur-sm sm:p-7">
            <LoginForm />
          </div>

          <div className="text-muted-foreground mt-6 flex items-center justify-between gap-4 text-xs">
            <span>Access is managed by your agency administrator.</span>
            <span className="text-foreground/60 inline-flex shrink-0 items-center gap-1 font-medium">
              Secure access
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
