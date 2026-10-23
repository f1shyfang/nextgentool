import { createEnv } from "@t3-oss/env-nextjs";
import { serverEnvSchema } from "./server-env";

export const env = createEnv({
  server: serverEnvSchema,
  runtimeEnv: { DATABASE_URL: process.env.DATABASE_URL },
});
