import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
await fs.mkdir("test-results/museum", { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const scenes = [
  ["teacher", "/teacher", 1440, 1000],
  ["gallery", "/teacher/activity/demo-dongbaek/gallery", 1440, 1000],
  ["entrance", "/", 1440, 1100],
  ["student", "/activity/demo-dongbaek-analysis", 390, 844],
  ["teacher-mobile", "/teacher", 390, 844],
  ["entrance-mobile", "/", 390, 844],
  ["background", "/teacher/activity/demo-dongbaek/background", 1366, 900],
  ["showcase", "/teacher/activity/demo-dongbaek/showcase", 1920, 1080],
];
try {
  for (const [name, url, width, height] of scenes) {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("http://localhost:5173/");
    if(url.startsWith("/teacher")) await page.evaluate(async()=>{
      const {request}=await import("/src/services/api.js");
      const {rememberAccess}=await import("/src/services/access.js");
      rememberAccess("admin",await request("admin/setup",{password:"preview-local-only"}));
    });
    await page.goto("http://localhost:5173" + url);
    await page.locator("main").waitFor();
    await page.evaluate(() =>
      Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 7000)),
      ]),
    );
    await page.locator("img").evaluateAll((images) =>
      Promise.allSettled(
        images.map((img) => {
          img.loading = "eager";
          return Promise.race([
            img.decode(),
            new Promise((r) => setTimeout(r, 7000)),
          ]);
        }),
      ),
    );
    await page.screenshot({
      path: `test-results/museum/${name}.png`,
      fullPage: true,
    });
    console.log(
      JSON.stringify({
        name,
        errors,
        layout: await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          background: getComputedStyle(document.body).backgroundColor,
          titleFont: getComputedStyle(
            document.querySelector("h1") || document.querySelector("main"),
          ).fontFamily,
          images: [...document.images].every(
            (img) => img.complete && img.naturalWidth > 0,
          ),
        })),
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
