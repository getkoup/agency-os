import { z } from "zod";

function serverBaseUrl(defaultValue: string) {
  return z
    .string()
    .default(defaultValue)
    .transform((value, context) => {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        context.addIssue({ code: "custom", message: "Invalid URL" });
        return z.NEVER;
      }
      const localHttp =
        url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1");
      if (url.protocol !== "https:" && !localHttp) {
        context.addIssue({ code: "custom", message: "URL must use HTTPS" });
      }
      if (url.username || url.password || url.search || url.hash) {
        context.addIssue({
          code: "custom",
          message: "URL cannot contain credentials, query, or fragment",
        });
      }
      return url.origin;
    });
}

const windsorEnvironmentSchema = z.object({
  WINDSOR_API_KEY: z.string().min(1),
  WINDSOR_DATA_BASE_URL: serverBaseUrl("https://connectors.windsor.ai"),
  WINDSOR_ONBOARD_BASE_URL: serverBaseUrl("https://onboard.windsor.ai"),
});

export interface WindsorEnvironment {
  WINDSOR_API_KEY: string;
  WINDSOR_DATA_BASE_URL: string;
  WINDSOR_ONBOARD_BASE_URL: string;
}

export function parseWindsorEnvironment(
  environment: Record<string, string | undefined> = process.env,
): WindsorEnvironment {
  return windsorEnvironmentSchema.parse(environment);
}
