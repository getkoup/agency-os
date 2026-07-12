import { TRPCError } from "@trpc/server";
import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import { TooltipProvider } from "~/components/ui/tooltip";
import { AppSidebar } from "~/features/navigation/app-sidebar";
import { USER_ROLE_LABELS } from "~/lib/roles";
import { signOut } from "~/server/auth";
import { getAuthenticatedUser } from "~/server/auth/current-user";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getAuthenticatedUser().catch((error: unknown) => {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED")
      redirect("/login");
    throw error;
  });
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar role={user.role} identity={user.name ?? user.email} />
        <SidebarInset>
          <header className="bg-background sticky top-0 z-30 flex h-16 items-center justify-between border-b px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-5" />
              <span className="font-medium">Analytics workspace</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{USER_ROLE_LABELS[user.role]}</Badge>
              <span className="hidden max-w-48 truncate text-sm sm:inline">
                {user.name ?? user.email}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  aria-label="Sign out"
                >
                  <LogOut />
                </Button>
              </form>
            </div>
          </header>
          <div className="bg-muted/30 min-h-[calc(100vh-4rem)] p-4 md:p-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
