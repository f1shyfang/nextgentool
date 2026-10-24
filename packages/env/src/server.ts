import { createEnv } from "@t3-oss/env-nextjs";
import { serverEnvSchema } from "./server-env";

export const env = createEnv({
  server: serverEnvSchema,
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  },
});
