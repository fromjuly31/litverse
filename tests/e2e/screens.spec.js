import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function expectScreenFits(page, content) {
  const size = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(size.scrollWidth, JSON.stringify(size)).toBeLessThanOrEqual(
    size.width + 1,
  );
  expect(size.scrollHeight, JSON.stringify(size)).toBeLessThanOrEqual(
    size.height + 1,
  );
  for (const element of await page.locator(content).all())
    await expect(element).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".archive-footer")).toBeInViewport({ ratio: 1 });
}

async function headerBounds(page) {
  return page
    .locator(".archive-header, .archive-header .brand, .archive-header nav a")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
}

test("header stays in place across all three screens and primary content fits the viewport", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("test-results/screens", { recursive: true });
  await page.goto("/");
  await expect(page.locator(".museum-choices")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const menu = page.getByRole("navigation", {
    name: "전시관 메뉴",
    exact: true,
  });
  for (const [width, height] of [
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
    [1215, 842],
    [1280, 720],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
    [2560, 1440],
    [568, 320],
    [667, 375],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const home = await headerBounds(page);
    await menu.getByRole("link", { name: "수업하기", exact: true }).click();
    await expect(page.locator(".lesson-card").first()).toBeVisible();
    await expectScreenFits(page, ".page-heading .btn, .lesson-card");
    expect(
      await headerBounds(page),
      `${width}x${height} classroom header`,
    ).toEqual(home);
    if ([320, 390, 1215, 844].includes(width))
      await page.screenshot({
        path: `test-results/screens/classroom-${width}x${height}.png`,
        fullPage: true,
      });
    await menu.getByRole("link", { name: "관람하기", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "첫 수업 시작하기" }),
    ).toBeVisible();
    await expectScreenFits(page, ".collection-empty, .collection-title");
    expect(
      await headerBounds(page),
      `${width}x${height} exhibition header`,
    ).toEqual(home);
    await expect(page.getByRole("searchbox")).toBeHidden();
    if ([320, 390, 1215, 844].includes(width))
      await page.screenshot({
        path: `test-results/screens/collection-${width}x${height}.png`,
        fullPage: true,
      });
    await page
      .getByRole("link", { name: "LITVERSE 처음으로", exact: true })
      .click();
    await expect(page.locator(".museum-choices")).toBeVisible();
    expect(await headerBounds(page)).toEqual(home);
  }
  expect(errors).toEqual([]);
});

test("many ongoing lessons remain reachable without scrolling and pagination adapts to rotation", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/teacher");
  await expect(page.locator(".lesson-card").first()).toBeVisible();
  await page.evaluate(async () => {
    const { seedData } = await import("/src/services/seed.js");
    const state = seedData(),
      base = state.activities[0];
    state.activities = Array.from({ length: 20 }, (_, index) => ({
      ...base,
      id: `responsive-lesson-${index}`,
      title: `${index + 1}. 긴 제목의 문학 작품도 카드 안에서 간결하게 표시하는 수업`,
      author: "긴 이름의 원작 작가",
      class_name: "우리 학교 2학년 문학 탐구반",
      updated_at: new Date(Date.UTC(2026, 0, 20 - index)).toISOString(),
    }));
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("litverse-demo-v1", 1);
      request.onsuccess = () => {
        const db = request.result,
          transaction = db.transaction("state", "readwrite");
        transaction.objectStore("state").put(state, "app");
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(page.locator(".lesson-count")).toHaveText("20");
  const previous = page.getByRole("button", { name: "이전 수업 목록" });
  const next = page.getByRole("button", { name: "다음 수업 목록" });
  await expect(previous).toBeDisabled();
  const seen = new Set();
  for (let count = 0; count < 20; count++) {
    await expectScreenFits(page, ".lesson-card, .classroom-pagination");
    for (const id of await page
      .locator(".lesson-card")
      .evaluateAll((cards) => cards.map((card) => card.dataset.lessonId)))
      seen.add(id);
    if (await next.isDisabled()) break;
    await next.click();
  }
  expect(seen.size).toBe(20);
  await expect(next).toBeDisabled();
  const firstVisible = await page
    .locator(".lesson-card")
    .first()
    .getAttribute("data-lesson-id");
  await page.setViewportSize({ width: 320, height: 520 });
  await expect(page.locator(".lesson-card")).toHaveCount(1);
  await expect(
    page.locator(`.lesson-card[data-lesson-id="${firstVisible}"]`),
  ).toBeVisible();
  await expectScreenFits(page, ".lesson-card, .classroom-pagination");
  await next.click();
  await expect(next).toBeDisabled();
  await previous.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.locator(`.lesson-card[data-lesson-id="${firstVisible}"]`),
  ).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator(".lesson-card")).toHaveCount(2);
  await expectScreenFits(page, ".lesson-card, .classroom-pagination");
  await page.locator(".lesson-card").last().click();
  await expect(page.getByLabel("수업 비밀번호", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
