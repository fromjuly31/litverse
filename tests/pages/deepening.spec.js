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
    await page.goto(`${entry}#/teacher/deepening/new`);
    const question = "서시의 화자는 어떤 삶을 바랐나요?";
    const answer = "스스로에게 부끄럽지 않은 삶을 살고 싶어 해요.";
    await page.getByLabel("수업 이름 (선택)", { exact: true }).fill("서시");
    await page.getByLabel("질문 1", { exact: true }).fill(question);
    await page.getByRole("button", { name: "시작하기", exact: true }).click();
    const link = await page
      .getByRole("link", { name: "학생 화면 열기", exact: true })
      .getAttribute("href");
    expect(link).toContain(`${entry}#/activity/`);
    expect(link).toMatch(/\/deepening\/[a-f0-9-]{36}$/);
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
