export const USER_ROLES = ["owner", "admin", "manager", "client"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  client: "Client",
};
