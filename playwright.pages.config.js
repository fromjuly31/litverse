import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/pages",
  timeout: 45000,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/pages",
  use: {
    browserName: "chromium",
    ...(process.platform === "win32" ? { channel: "msedge" } : {}),
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/serve-pages.mjs",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
