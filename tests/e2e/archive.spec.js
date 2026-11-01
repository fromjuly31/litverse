import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

test("museum entrance, password gate, final pair, public poster, reopen and administrator controls", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("test-results/museum", { recursive: true });
  await page.goto("/");
  await expect(page.locator(".museum-choices>a")).toHaveCount(2);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page
    .locator(".museum-choice img")
    .evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode())));
  await page.screenshot({
    path: "test-results/museum/entrance.png",
    fullPage: true,
  });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator(".choice-class").click();
  await page
    .getByRole("link", { name: "동백꽃 수업 열기", exact: true })
    .click();
  await page
    .getByLabel("수업 비밀번호", { exact: true })
    .fill("class-password");
  await page
    .getByLabel("비밀번호 확인", { exact: true })
    .fill("class-password");
  await page.getByRole("button", { name: "비밀번호 설정하고 시작" }).click();
  await expect(page.getByLabel("작품 줄거리", { exact: true })).not.toHaveValue(
    "",
  );
  await expect(page.locator(".synopsis-note")).toContainText("내장 예시");
  await page.getByRole("link", { name: "수업하기", exact: true }).click();
  await page
    .getByRole("link", { name: "동백꽃 수업 열기", exact: true })
    .click();
  await page
    .getByLabel("수업 비밀번호", { exact: true })
    .fill("wrong-password");
  await page.getByRole("button", { name: "수업 열기", exact: true }).click();
  await expect(page.locator(".step-error")).toContainText("일치하지");
  const denied = await page.evaluate(async () => {
    try {
      await (
        await import("/src/services/api.js")
      ).request("teacher/stage", { id: "demo-dongbaek", stage: "CLOSED" });
      return false;
    } catch (e) {
      return e.status === 401;
    }
  });
  expect(denied).toBe(true);
  await page
    .getByLabel("수업 비밀번호", { exact: true })
    .fill("class-password");
  await page.getByRole("button", { name: "수업 열기", exact: true }).click();
  await page
    .getByRole("navigation", { name: "수업 활동", exact: true })
    .getByRole("link", { name: "등장인물 갤러리" })
    .click();
  await expect(
    page.getByRole("button", { name: "최종본 선택", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "수업 마무리", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "수업 마무리", exact: true }),
  ).toHaveCount(0);
  await page.locator("[name=character_image_id]").first().check();
  await expect(page.locator("[name=character_image_id]:checked")).toHaveCount(
    1,
  );
  await page.locator("[name=scene_image_id]").first().check();
  await page
    .getByLabel("시간적 배경 정리", { exact: true })
    .fill("농사일과 노란 동백꽃이 어우러진 1930년대 농촌의 봄.");
  await page
    .getByLabel("공간적 배경 정리", { exact: true })
    .fill(
      "마을과 산기슭, 점순이네 닭과 우리 집 닭이 마주치는 농촌의 일상 공간.",
    );
  await page
    .getByLabel("전시작 제작자 이름 · 서명", { exact: true })
    .fill("문학을 읽는 우리");
  await page
    .getByRole("button", { name: "포스터 미리보기", exact: true })
    .click();
  await expect(page.locator(".final-preview .literary-poster")).toBeVisible();
  await page
    .getByRole("button", { name: "수업 완료 · 전시하기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("18장");
  await page
    .getByRole("button", { name: "최종 완료하고 전시", exact: true })
    .click();
  await expect(page).toHaveURL(/\/exhibition\/demo-dongbaek$/);
  await expect(page.locator(".literary-poster img")).toHaveCount(2);
  await expect(page.locator(".poster-signature")).toContainText(
    "문학을 읽는 우리",
  );
  const state = await page.evaluate(async () => {
    const { request } = await import("/src/services/api.js");
    const data = await request("teacher/get", { id: "demo-dongbaek" });
    return {
      count: data.images.length,
      stage: data.activity.stage,
      worksheets: data.worksheets.length,
    };
  });
  expect(state).toEqual({ count: 2, stage: "CLOSED", worksheets: 18 });
  await page
    .locator(".literary-poster img")
    .evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode())));
  await page.screenshot({
    path: "test-results/museum/poster.png",
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "포스터 HTML 저장" }).click();
  const download = await downloadPromise;
  const exported = await readFile(await download.path(), "utf8");
  expect(exported).toContain("data:image/webp;base64,");
  expect(exported).toContain("문학을 읽는 우리");
  const pdf = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(
    (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length,
  ).toBe(1);
  const exportedPage = await context.newPage();
  await exportedPage.setContent(exported);
  await exportedPage
    .locator("img")
    .evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode())));
  await exportedPage.evaluate(() => {
    document.querySelector(".poster-story p").textContent =
      "한 작품의 줄거리입니다. ".repeat(120);
    document
      .querySelectorAll(".poster-interpretation>p")
      .forEach(
        (p) => (p.textContent = "본문을 근거로 해석한 내용입니다. ".repeat(70)),
      );
  });
  const longPdf = await exportedPage.pdf({
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(
    (longPdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length,
  ).toBe(1);
  await exportedPage.close();
  const visitor = await context.newPage();
  await visitor.goto("/exhibition/demo-dongbaek");
  await expect(visitor.locator(".literary-poster")).toBeVisible();
  await visitor.goto("/teacher/activity/demo-dongbaek/background");
  await expect(
    visitor.getByLabel("수업 비밀번호", { exact: true }),
  ).toBeVisible();
  await visitor.close();
  await page.goto("/exhibition");
  await expect(page.locator(".exhibit-card")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/museum/collection.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/museum/collection-mobile.png",
    fullPage: true,
  });
  await page.goto("/teacher");
  await expect(page.locator('[data-lesson-id="demo-dongbaek"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /완료된 수업/ })).toHaveCount(
    0,
  );
  await page
    .getByRole("navigation", { name: "전시관 메뉴" })
    .getByRole("link", { name: "관람하기", exact: true })
    .click();
  await page.getByRole("link", { name: "동백꽃 전시작 자세히 보기" }).click();
  await page.getByRole("link", { name: "수업 다시 열기", exact: true }).click();
  await page
    .getByLabel("수업 비밀번호", { exact: true })
    .fill("class-password");
  await page.getByRole("button", { name: "수업 열기", exact: true }).click();
  await expect(page.locator(".completed-class")).toBeVisible();
  await page
    .getByRole("button", { name: "수업 다시 열기", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "수업 다시 열기", exact: true })
    .click();
  await expect(page.locator(".synopsis-panel")).toBeVisible();
  await page.goto("/exhibition");
  await expect(page.locator(".exhibit-card")).toHaveCount(0);
  await page.goto("/admin");
  await page
    .getByLabel("관리자 비밀번호", { exact: true })
    .fill("admin-password");
  await page
    .getByLabel("관리자 비밀번호 확인", { exact: true })
    .fill("admin-password");
  await page.getByRole("button", { name: "관리자 설정", exact: true }).click();
  await expect(page.locator(".admin-row")).toHaveCount(2);
  const row = page.locator(".admin-row").filter({ hasText: "동백꽃" });
  await row.getByRole("button", { name: "암호 재설정" }).click();
  await page
    .getByLabel("새 수업 비밀번호", { exact: true })
    .fill("changed-password");
  await page.getByRole("button", { name: "새 비밀번호 저장" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await row.getByRole("link", { name: "열기 · 수정" }).click();
  await expect(page.locator(".synopsis-panel")).toBeVisible();
  await page.goto("/admin");
  await page
    .locator(".admin-row")
    .filter({ hasText: "동백꽃" })
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("textbox").fill("동백꽃");
  await page
    .getByRole("button", { name: "수업 전체 삭제", exact: true })
    .click();
  await expect(page.locator(".admin-row")).toHaveCount(1);
  expect(errors).toEqual([]);
});
