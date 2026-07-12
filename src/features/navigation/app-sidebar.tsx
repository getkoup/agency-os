"use client";

import {
  BarChart3,
  Building2,
  DatabaseZap,
  LayoutDashboard,
  ListFilter,
  Users,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { type UserRole } from "~/lib/roles";
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

const items = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    roles: ["owner", "admin", "client"],
  },
  {
    href: "/dashboard/performance",
    label: "Performance",
    icon: BarChart3,
    roles: ["owner", "admin", "client"],
  },
  {
    href: "/dashboard/accounts",
    label: "Accounts",
    icon: WalletCards,
    roles: ["owner", "admin", "client"],
  },
  {
    href: "/dashboard/leads",
    label: "Leads",
    icon: ListFilter,
    roles: ["owner", "admin", "client"],
  },
  {
    href: "/dashboard/clients",
    label: "Clients",
    icon: Building2,
    roles: ["owner", "admin"],
  },
  {
    href: "/dashboard/synchronization",
    label: "Synchronization",
    icon: DatabaseZap,
    roles: ["owner", "admin"],
  },
  {
    href: "/dashboard/users",
    label: "Users & Access",
    icon: Users,
    roles: ["owner"],
  },
] satisfies Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
}>;

export function AppSidebar({
  role,
  identity,
}: {
  role: UserRole;
  identity: string;
}) {
  const pathname = usePathname();
  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-sidebar-border border-b px-4 py-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 font-semibold"
        >
          <span className="bg-sidebar-primary text-sidebar-primary-foreground grid size-8 place-items-center rounded-lg">
            A
          </span>
          <span className="group-data-[collapsible=icon]:hidden">
            Agency OS
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Analytics</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items
                .filter((item) => item.roles.includes(role))
                .map((item) => {
                  const active =
                    item.href === "/dashboard"
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                      >
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-sidebar-border text-sidebar-foreground/70 border-t p-4 text-xs">
        <span className="truncate group-data-[collapsible=icon]:hidden">
          {identity}
        </span>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
