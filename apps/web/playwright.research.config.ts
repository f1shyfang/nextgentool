import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export default defineConfig({
  testDir: "./tests",
  testMatch: "research.e2e.spec.ts",
  // Other domain suites run concurrently; Playwright clears its output folder.
  outputDir: "../../tmp/research-browser-results",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4319",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
  },
  webServer: {
    command: "pnpm exec tsx tests/research-harness.tsx",
    url: "http://127.0.0.1:4319",
    reuseExistingServer: false,
  },
});
