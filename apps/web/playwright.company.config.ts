import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export default defineConfig({
  testDir: "./tests",
  testMatch: ["company.e2e.spec.ts", "company-signals.e2e.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4327",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
  },
  webServer: {
    command:
      "pnpm exec tsx --env-file-if-exists=.env --env-file-if-exists=.env.local tests/company-harness.tsx",
    url: "http://127.0.0.1:4327/companies",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
