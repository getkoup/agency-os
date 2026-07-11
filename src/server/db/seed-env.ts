import { z } from "zod";

const seedEnvironmentSchema = z
  .object({
    SEED_ADMIN_EMAIL: z
      .string()
      .trim()
      .email()
      .transform((v) => v.toLowerCase()),
    SEED_ADMIN_PASSWORD: z.string().min(12),
    SEED_ADMIN_NAME: z.string().trim().min(1),
    SEED_CLIENT_EMAIL: z
      .string()
      .trim()
      .email()
      .transform((v) => v.toLowerCase()),
    SEED_CLIENT_PASSWORD: z.string().min(12),
    SEED_CLIENT_NAME: z.string().trim().min(1),
    SEED_CLIENT_EXTERNAL_ACCOUNT_ID: z.string().trim().min(1),
  })
  .superRefine((value, context) => {
    if (value.SEED_ADMIN_EMAIL === value.SEED_CLIENT_EMAIL) {
      context.addIssue({
        code: "custom",
        path: ["SEED_CLIENT_EMAIL"],
        message: "Seeded admin and client emails must differ",
      });
    }
  });

export function parseSeedEnvironment(
  environment: Record<string, string | undefined> = process.env,
) {
  return seedEnvironmentSchema.parse(environment);
}
