import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL,
    browserName: "chromium",
    channel: process.env.E2E_BROWSER_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  // Instant-navigation diagnostics are dev-only. Reuse the developer's server
  // if present; otherwise start next dev (database migration/seeding is separate).
  webServer: {
    command: `npm run dev -- --port ${new URL(baseURL).port || "3000"}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
