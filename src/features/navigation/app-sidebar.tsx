"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "~/components/ui/sidebar";
import {
  DASHBOARD_DESTINATIONS,
  isDestinationActive,
} from "~/features/navigation/dashboard-destinations";
import { USER_ROLE_LABELS, type UserRole } from "~/lib/roles";

export function AppSidebar({
  role,
  name,
  email,
}: {
  role: UserRole;
  name: string | null;
  email: string;
}) {
  const pathname = usePathname();
  const identity = name ?? email;
  const initials = identity
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <Sidebar
      collapsible="icon"
      variant="floating"
      className="md:py-[10px] md:pl-[10px]"
    >
      <SidebarHeader className="px-3 pt-4 pb-6">
        <Link
          href="/dashboard"
          prefetch={false}
          className="flex items-center gap-3 font-semibold tracking-tight"
        >
          <span className="bg-sidebar-primary text-sidebar-primary-foreground grid size-9 shrink-0 place-items-center rounded-xl shadow-lg">
            <Sparkles className="size-[1.05rem]" aria-hidden="true" />
          </span>
          <span className="group-data-[collapsible=icon]:hidden">
            <span className="block">Agency OS</span>
            <span className="text-sidebar-foreground/45 block text-[0.6rem] font-medium tracking-[0.14em] uppercase">
              Operating intelligence
            </span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-2">
        {(["Workspace", "Administration"] as const).map((group) => {
          const destinations = DASHBOARD_DESTINATIONS.filter(
            (item) => item.group === group && item.roles.includes(role),
          );
          if (destinations.length === 0) return null;

          return (
            <SidebarGroup key={group} className="px-0 py-2">
              <SidebarGroupLabel className="text-sidebar-foreground/45 px-3 text-[0.65rem] font-semibold tracking-[0.16em] uppercase group-data-[collapsible=icon]:hidden">
                {group}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {destinations.map((item) => {
                    const active = isDestinationActive(pathname, item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                          className="text-sidebar-foreground/68 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground relative h-11 rounded-xl px-3 data-[active=true]:font-semibold data-[active=true]:shadow-sm"
                        >
                          <Link href={item.href} prefetch={false}>
                            <item.icon className="size-[1.05rem]" />
                            <span>{item.label}</span>
                            {active ? (
                              <span className="bg-sidebar-primary ml-auto size-1.5 rounded-full group-data-[collapsible=icon]:hidden" />
                            ) : null}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="border-sidebar-border border-t p-3">
        <div className="flex items-center gap-3 rounded-xl px-1 py-2">
          <span className="bg-sidebar-accent text-sidebar-accent-foreground grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold">
            {initials || "A"}
          </span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-sidebar-foreground truncate text-sm font-medium">
              {identity}
            </p>
            <p className="text-sidebar-foreground/55 truncate text-xs">
              {USER_ROLE_LABELS[role]}
            </p>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
