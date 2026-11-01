import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const sizes = [
  [320, 520],
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
  [412, 915],
  [600, 800],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
  [568, 320],
  [667, 375],
  [844, 390],
];

async function expectEntranceFits(page) {
  const layout = await page.evaluate(() => {
    const bounds = (el) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      };
    };
    const cards = [...document.querySelectorAll(".museum-choice")];
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      footer: bounds(document.querySelector(".museum-entry>.archive-footer")),
      cards: cards.map((card) => ({
        box: bounds(card),
        title: bounds(card.querySelector("h2")),
        label: bounds(card.querySelector(".choice-index")),
        cta: bounds(card.querySelector(".choice-enter")),
      })),
      imageSources: cards.map((card) => card.querySelector("img").naturalWidth),
    };
  });
  expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.width + 1,
  );
  expect(layout.scrollHeight, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.height + 1,
  );
  expect(layout.footer.bottom).toBeLessThanOrEqual(layout.height + 1);
  for (const card of layout.cards) {
    expect(card.box.height).toBeGreaterThanOrEqual(110);
    for (const content of [card.title, card.label, card.cta]) {
      expect(content.top).toBeGreaterThanOrEqual(card.box.top);
      expect(content.bottom).toBeLessThanOrEqual(card.box.bottom);
      expect(content.right).toBeLessThanOrEqual(card.box.right);
      expect(content.left).toBeGreaterThanOrEqual(card.box.left);
    }
    expect(card.title.bottom).toBeLessThanOrEqual(card.cta.top);
  }
  expect(layout.imageSources.every((n) => n > 0)).toBe(true);
}

test("entrance fits phone, tablet, laptop and landscape screens without scrolling or clipping", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("test-results/entrance", { recursive: true });
  await page.goto("/");
  await expect(page.locator(".museum-choices>a")).toHaveCount(2);
  await expect(page.locator(".inventory-summary")).toHaveText(
    "전시 중인 작품0점",
  );
  await page
    .locator(".museum-choice img")
    .evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await expectEntranceFits(page);
    if (
      [
        [320, 568],
        [390, 844],
        [1366, 768],
        [1920, 1080],
        [844, 390],
      ].some(([w, h]) => w === width && h === height)
    )
      await page.screenshot({
        path: `test-results/entrance/entry-${width}x${height}.png`,
        fullPage: true,
      });
  }
  // Opening/closing browser chrome and rotating the device must reflow immediately.
  for (const height of [620, 750, 600, 844]) {
    await page.setViewportSize({ width: 390, height });
    await expectEntranceFits(page);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".choice-class").focus();
  await expect(page.locator(".choice-class")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.locator(".museum-entry")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight > innerHeight,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});

test("a large collection stays compact on the entrance and remains reachable with keyboard or touch", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".museum-choices")).toBeVisible();
  // Seed this isolated browser context with many completed posters, including long titles.
  await page.evaluate(async () => {
    const { seedData } = await import("/src/services/seed.js");
    const { finalResult } = await import("/src/utils/archive.js");
    const state = seedData(),
      base = state.activities[0],
      photos = state.images.filter((i) => i.activity_id === base.id);
    const portrait = photos.find((i) => i.image_type === "character"),
      scene = photos.find((i) => i.image_type === "scene");
    const result = finalResult(base, state.worksheets, photos, {
      character_image_id: portrait.id,
      scene_image_id: scene.id,
      synopsis: "함께 읽은 문학 작품의 줄거리입니다.",
      temporal_background: "봄",
      spatial_background: "농촌",
      character_summary: "인물의 마음을 해석합니다.",
      scene_summary: "기억에 남는 장면입니다.",
      signature: "우리 문학반",
    });
    for (let i = 0; i < 13; i++) {
      const id = `responsive-exhibit-${i}`,
        title =
          i === 12
            ? "아주 긴 작품 제목도 화면을 넘치지 않고 끝까지 열어볼 수 있는 문학 전시"
            : "우리의 문학 작품 " + i;
      state.activities.push({
        ...base,
        id,
        title,
        finalized_at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
        final_result: {
          ...result,
          title,
          character: { ...result.character, image_id: `${id}-character` },
          scene: { ...result.scene, image_id: `${id}-scene` },
        },
        signature: "우리 문학반",
      });
      state.images.push(
        { ...portrait, id: `${id}-character`, activity_id: id },
        { ...scene, id: `${id}-scene`, activity_id: id },
      );
    }
    await new Promise((resolve, reject) => {
      const req = indexedDB.open("litverse-demo-v1", 1);
      req.onsuccess = () => {
        const conn = req.result,
          tx = conn.transaction("state", "readwrite");
        tx.objectStore("state").put(state, "app");
        tx.oncomplete = () => {
          conn.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  await page.reload();
  await page
    .locator(".museum-choice img")
    .evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1366, 768],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expectEntranceFits(page);
  }
  await expect(
    page.getByRole("link", { name: "전체 전시작 13점 보기" }),
  ).toBeVisible();
  await expect(page.locator(".inventory-summary")).toHaveText(
    "전시 중인 작품13점",
  );
  await page.getByRole("link", { name: "전체 전시작 13점 보기" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".exhibit-card")).toHaveCount(13);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight > innerHeight,
    ),
  ).toBe(true);
  const header = page.locator(".archive-header");
  const initialHeader = await header.boundingBox();
  await page.locator(".exhibit-card").last().scrollIntoViewIfNeeded();
  await expect(header).toBeInViewport({ ratio: 1 });
  expect(await header.boundingBox()).toEqual(initialHeader);
  await header.getByRole("link", { name: "수업하기", exact: true }).click();
  await expect(page.locator(".classroom-overview")).toBeVisible();
  expect(await header.boundingBox()).toEqual(initialHeader);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  // At unusually small/zoomed viewports content remains scrollable, never trapped.
  await page.goto("/");
  await page.setViewportSize({ width: 320, height: 300 });
  await page.locator(".choice-visit").scrollIntoViewIfNeeded();
  await page.locator(".choice-visit").click();
  await expect(page.locator(".exhibit-card")).toHaveCount(13);
});
