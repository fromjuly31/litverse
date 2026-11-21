import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

for (const [name, entry] of [
  ["root", "http://127.0.0.1:4174/"],
  ["subdirectory", "http://127.0.0.1:4174/preview-repository/"],
  ["single HTML", pathToFileURL(resolve("release/index.html")).href],
]) {
  test(`${name}: class question QR link and drafts work on static hosting`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${entry}#/teacher`);
    const tabs = page.getByRole("navigation", { name: "수업 분야" });
    await expect(tabs).toHaveCount(0);
    await page.getByRole("link", { name: "동백꽃 수업 열기" }).click();
    await page.getByLabel("수업 비밀번호", { exact: true }).fill("demo-lesson");
    await page.getByLabel("비밀번호 확인", { exact: true }).fill("demo-lesson");
    await page.getByRole("button", { name: "비밀번호 설정하고 시작" }).click();
    await tabs.getByRole("link", { name: "이해 심화하기" }).click();
    const question = "점순이는 왜 감자를 건넸을까요?";
    const answer = "감자를 건네며 마음을 표현하고 싶었어요.";
    await page.getByLabel("질문 1", { exact: true }).fill(question);
    await page.getByRole("button", { name: "시작하기", exact: true }).click();
    const link = await page
      .getByRole("link", { name: "학생 화면 열기", exact: true })
      .getAttribute("href");
    expect(link).toContain(`${entry}#/activity/`);
    expect(link).toMatch(
      /\/activity\/demo-dongbaek-analysis\/deepening\/[a-f0-9-]{36}$/,
    );
    await page.goto(link);
    await page.getByLabel("학생 번호 또는 별칭", { exact: true }).fill("01번");
    const field = page.getByLabel(`1. ${question}`, { exact: true });
    await field.fill(answer);
    await page.reload();
    await expect(field).toHaveValue(answer);
    await page.getByRole("button", { name: "답변 제출하기" }).click();
    await expect(page.getByText("답변을 제출했어요.")).toBeVisible();
    await expect(page.getByText(answer)).toBeVisible();
    expect(errors).toEqual([]);
  });
}
