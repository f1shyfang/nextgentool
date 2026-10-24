import { createEnv } from "@t3-oss/env-nextjs";
import { serverEnvSchema } from "./server-env";

export const env = createEnv({
  server: serverEnvSchema,
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    RESEARCH_STORAGE_PATH: process.env.RESEARCH_STORAGE_PATH,
    CLAMAV_HOST: process.env.CLAMAV_HOST,
    CLAMAV_PORT: process.env.CLAMAV_PORT,
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  },
});
