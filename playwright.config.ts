import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.E2E_PORT ?? "3107";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: `npm run dev -- -p ${e2ePort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
