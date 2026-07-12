import { z } from "zod";

const normalizedEmail = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());

const seedEnvironmentSchema = z
  .object({
    SEED_OWNER_EMAIL: normalizedEmail,
    SEED_OWNER_PASSWORD: z.string().min(12),
    SEED_OWNER_NAME: z.string().trim().min(1),
    SEED_ADMIN_EMAIL: normalizedEmail,
    SEED_ADMIN_PASSWORD: z.string().min(12),
    SEED_ADMIN_NAME: z.string().trim().min(1),
    SEED_CLIENT_EMAIL: normalizedEmail,
    SEED_CLIENT_PASSWORD: z.string().min(12),
    SEED_CLIENT_NAME: z.string().trim().min(1),
    SEED_CLIENT_EXTERNAL_ACCOUNT_ID: z.string().trim().min(1),
  })
  .superRefine((value, context) => {
    const emails = [
      value.SEED_OWNER_EMAIL,
      value.SEED_ADMIN_EMAIL,
      value.SEED_CLIENT_EMAIL,
    ];
    if (new Set(emails).size !== emails.length) {
      context.addIssue({
        code: "custom",
        path: ["SEED_CLIENT_EMAIL"],
        message: "Seeded owner, admin, and client emails must differ",
      });
    }
  });

export function parseSeedEnvironment(
  environment: Record<string, string | undefined> = process.env,
) {
  return seedEnvironmentSchema.parse(environment);
}
