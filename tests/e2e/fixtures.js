import { test as base, expect } from "@playwright/test";
export const test = base.extend({
  demoAdmin: [
    async ({ page }, use) => {
      await page.goto("/");
      await page.evaluate(async () => {
        const { request } = await import("/src/services/api.js");
        const { rememberAccess } = await import("/src/services/access.js");
        rememberAccess(
          "admin",
          await request("admin/setup", { password: "admin-test-password" }),
        );
      });
      await use();
    },
    { auto: true },
  ],
});
export { expect };
