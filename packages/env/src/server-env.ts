import { z } from "zod";

function usesVerifiedRemoteTls(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const isLocalHost = ["localhost", "127.0.0.1", "[::1]"].includes(
    url.hostname,
  );

  return isLocalHost || url.searchParams.get("sslmode") === "verify-full";
}

export const serverEnvSchema = {
  CLERK_SECRET_KEY: z.string().optional(),
  RESEARCH_STORAGE_PATH: z.string().default(".research-private"),
  CLAMAV_HOST: z.string().default("127.0.0.1"),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  TEST_DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }).optional(),
  DATABASE_URL: z
    .url({ protocol: /^postgres(?:ql)?$/ })
    .refine(usesVerifiedRemoteTls, {
      error: "Remote PostgreSQL URLs must use sslmode=verify-full.",
    }),
};

export function loadServerEnv(runtimeEnv: Record<string, string | undefined>) {
  return z.object(serverEnvSchema).parse(runtimeEnv);
}
