import { z } from "zod";

function usesVerifiedRemoteTls(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const isLocalHost = ["localhost", "127.0.0.1", "[::1]"].includes(
    url.hostname,
  );

  return isLocalHost || url.searchParams.get("sslmode") === "verify-full";
}

export const serverEnvSchema = {
  DATABASE_URL: z
    .url({ protocol: /^postgres(?:ql)?$/ })
    .refine(usesVerifiedRemoteTls, {
      error: "Remote PostgreSQL URLs must use sslmode=verify-full.",
    }),
};

export function loadServerEnv(runtimeEnv: { DATABASE_URL?: string }) {
  return z.object(serverEnvSchema).parse(runtimeEnv);
}
