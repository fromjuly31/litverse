import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

for (const [name, entry, scan] of [
  ["repository PDF import", "http://127.0.0.1:4174/preview-repository/", false],
  [
    "offline standalone Korean OCR",
    pathToFileURL(resolve("release/index.html")).href,
    true,
  ],
]) {
  test(`${name}: attach, select, save and read paragraphs`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (scan) await context.route(/^https?:\/\//, (route) => route.abort());
    else
      await context.route(/^https:\/\/(fonts\.|cdn\.jsdelivr)/, (route) =>
        route.abort(),
      );
    await page.goto(`${entry}#/teacher/activities/new`);
    await page.getByLabel("작품 제목").fill("본문 학습 배포 확인");
    await page.getByLabel("작가", { exact: true }).fill("문학 선생님");
    await page
      .getByLabel("수업 소개", { exact: true })
      .fill("PDF 본문을 읽으며 작품의 의미를 나눕니다.");
    await page.getByRole("tab", { name: "2단계 작품 줄거리" }).click();
    await page.locator("#enable-text-study").check();
    await page
      .locator("#lesson-pdf")
      .setInputFiles(
        `tests/fixtures/${scan ? "text-study-scan.pdf" : "text-study.pdf"}`,
      );
    if (scan) {
      await expect(page.locator("#pdf-status")).toContainText("스캔 이미지");
      await page
        .getByRole("button", { name: "현재 페이지 문자 인식", exact: true })
        .click();
      await expect(page.locator("#pdf-status")).toContainText(
        "문자 인식으로 본문 영역",
        { timeout: 90000 },
      );
      await page.locator(".pdf-block").nth(1).click();
    } else
      await page.getByRole("button", { name: /본문 선택: 봄바람이/ }).click();
    await expect(page.locator("#paragraph-count")).toHaveText("1");
    const selected = await page
      .getByLabel("본문 문단 1", { exact: true })
      .inputValue();
    expect(selected).toMatch(/[가-힣]/);
    await page.getByRole("tab", { name: "3단계 질문 목록" }).click();
    await page
      .getByLabel("질문 1", { exact: true })
      .fill("사진에서 표현한 것은 무엇인가요?");
    await page.getByRole("tab", { name: "4단계 확인과 시작" }).click();
    await page.getByLabel("수업 비밀번호", { exact: true }).fill("1234");
    await page.getByLabel("비밀번호 확인", { exact: true }).fill("1234");
    await page
      .getByRole("button", { name: "수업 만들기", exact: true })
      .click();
    const tabs = page.getByRole("navigation", {
      name: "수업 활동",
      exact: true,
    });
    await tabs.getByRole("link", { name: /본문 학습/ }).click();
    await expect(page.locator("#reading-text")).toHaveText(selected);
    await page.reload();
    await expect(page.locator("#reading-text")).toHaveText(selected);
    expect(errors).toEqual([]);
  });
}
