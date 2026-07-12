import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { compare, hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { USER_ROLES, type UserRole } from "~/lib/roles";
import { db } from "~/server/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "~/server/db/schema";

const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

const dummyHashPromise = hash("agency-os-invalid-credential-placeholder", 12);

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: { id: string; role: UserRole } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
  }
}

const adapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
}) as NonNullable<NextAuthConfig["adapter"]>;

export const authConfig = {
  adapter,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const [user] = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            status: users.status,
            passwordHash: users.passwordHash,
          })
          .from(users)
          .where(sql`lower(${users.email}) = ${parsed.data.email}`)
          .limit(1);
        const passwordMatches = await compare(
          parsed.data.password,
          user?.passwordHash ?? (await dummyHashPromise),
        );
        if (!user?.passwordHash || user.status !== "active" || !passwordMatches)
          return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session: ({ session, token }) => {
      const id = typeof token.id === "string" ? token.id : token.sub;
      const role = USER_ROLES.find((value) => value === token.role) ?? null;
      if (!id || !role) return session;
      return {
        ...session,
        user: { ...session.user, id, role },
      };
    },
  },
} satisfies NextAuthConfig;
