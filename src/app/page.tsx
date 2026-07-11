import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { getCurrentUser } from "~/server/auth/current-user";

export default async function Home() {
  const session = await auth();
  if (session?.user?.id) {
    const user = await getCurrentUser(session.user.id).catch(() => null);
    if (user) redirect("/dashboard");
  }
  redirect("/login");
}
