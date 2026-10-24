import { env } from "@repo/env/server";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/modules/users/infrastructure/schema.ts",
    "./src/modules/deal-pipeline/infrastructure/schema.ts",
    "./src/modules/company-intelligence/infrastructure/schema.ts",
    "./src/modules/research-and-diligence/infrastructure/schema.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
