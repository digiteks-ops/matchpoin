import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright is optional in this repository: specs auto-skip when
 * `.env.test.local` (or the required accounts) is missing.
 *
 * Enable locally:
 *   npm i -D @playwright/test
 *   npx playwright install chromium
 *   cp .env.test.local.example .env.test.local   # then fill values
 *   npm run test:e2e:playwright
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
