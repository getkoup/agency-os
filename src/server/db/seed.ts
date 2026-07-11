import { hash } from "bcryptjs";
import { eq, or, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { parseSeedEnvironment } from "~/server/db/seed-env";
import { clientMemberships, sourceAccounts, users } from "~/server/db/schema";

const seed = parseSeedEnvironment();

const accountMatches = await db
  .select({ clientId: sourceAccounts.clientId })
  .from(sourceAccounts)
  .where(
    or(
      eq(
        sourceAccounts.connectorAccountId,
        seed.SEED_CLIENT_EXTERNAL_ACCOUNT_ID,
      ),
      eq(
        sourceAccounts.externalAccountId,
        seed.SEED_CLIENT_EXTERNAL_ACCOUNT_ID,
      ),
    ),
  );
const clientIds = new Set(
  accountMatches.map((match) => match.clientId).filter((id) => id !== null),
);
if (accountMatches.length === 0) {
  throw new Error(
    "Seed client account was not found. Run the Windsor sync before db:seed.",
  );
}
if (accountMatches.some((match) => match.clientId === null)) {
  throw new Error("Seed client account is unassigned; assign or map it first.");
}
if (clientIds.size !== 1) {
  throw new Error("Seed client account matches span multiple clients.");
}
const [clientId] = clientIds;
if (!clientId) throw new Error("Seed client account did not resolve a client.");

const [adminPasswordHash, clientPasswordHash] = await Promise.all([
  hash(seed.SEED_ADMIN_PASSWORD, 12),
  hash(seed.SEED_CLIENT_PASSWORD, 12),
]);

await db.transaction(async (tx) => {
  async function upsertSeedUser(input: {
    email: string;
    name: string;
    passwordHash: string;
    role: "agency_admin" | "client_viewer";
  }) {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email}`)
      .limit(1);
    if (existing) {
      await tx.update(users).set(input).where(eq(users.id, existing.id));
      return existing.id;
    }
    const [created] = await tx
      .insert(users)
      .values(input)
      .returning({ id: users.id });
    if (!created) throw new Error(`Failed to seed user ${input.email}`);
    return created.id;
  }

  await upsertSeedUser({
    email: seed.SEED_ADMIN_EMAIL,
    name: seed.SEED_ADMIN_NAME,
    passwordHash: adminPasswordHash,
    role: "agency_admin",
  });
  const viewerId = await upsertSeedUser({
    email: seed.SEED_CLIENT_EMAIL,
    name: seed.SEED_CLIENT_NAME,
    passwordHash: clientPasswordHash,
    role: "client_viewer",
  });
  await tx
    .delete(clientMemberships)
    .where(eq(clientMemberships.userId, viewerId));
  await tx.insert(clientMemberships).values({ userId: viewerId, clientId });
});

console.info("Seeded one agency admin and one client viewer.");
