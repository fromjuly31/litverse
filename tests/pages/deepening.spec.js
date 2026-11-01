import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

for (const [name, entry] of [
  ["root", "http://127.0.0.1:4174/"],
  ["subdirectory", "http://127.0.0.1:4174/preview-repository/"],
  ["single HTML", pathToFileURL(resolve("release/index.html")).href],
]) {
  test(`${name}: deepening QR route, cached questions and drafts survive reload`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${entry}#/teacher/deepening/new`);
    await page.getByLabel("문학 작품명", { exact: true }).fill("서시");
    await page.getByLabel("작가명", { exact: true }).fill("윤동주");
    await page
      .getByRole("button", { name: "작품 분석하기", exact: true })
      .click();
    await expect(page.getByRole("combobox", { name: "문학 갈래" })).toHaveText(
      "시",
    );
    await page.locator('[name="reviewed"]').check();
    await page
      .getByRole("button", { name: "이 분석으로 수업 만들기", exact: true })
      .click();
    await page
      .getByRole("button", { name: "심화 활동 시작", exact: true })
      .click();
    await page
      .getByRole("button", { name: "학생 참여 QR", exact: true })
      .click();
    const link = await page
      .getByRole("link", { name: "학생 화면 열기", exact: true })
      .getAttribute("href");
    expect(link).toContain(`${entry}#/activity/`);
    expect(link).toMatch(/\/deepening$/);
    await page
      .getByRole("link", { name: "학생 화면 열기", exact: true })
      .click();
    await page
      .getByLabel("학생 번호 또는 별칭", { exact: true })
      .fill("시를 읽는 나");
    await page
      .getByRole("button", { name: "심화 활동 참여하기", exact: true })
      .click();
    await page
      .getByLabel("나의 선택", { exact: true })
      .fill("나도 추구하고 싶은 태도이다");
    await page
      .getByLabel("선택한 이유", { exact: true })
      .fill(
        "스스로를 돌아보는 태도가 삶을 더 나은 방향으로 이끌 수 있다고 생각합니다.",
      );
    await page
      .getByLabel("작품 속 판단 근거", { exact: true })
      .fill(
        "화자가 자신의 삶과 부끄러움을 돌아보며 다짐하는 태도에 주목했습니다.",
      );
    await page
      .getByRole("button", { name: "최초 판단 제출하고 질문 받기" })
      .click();
    await expect(page.getByLabel("현실과 맥락 탐구 답변")).toBeVisible();
    const questions = await page
      .locator(".deep-question-card h2")
      .allTextContents();
    await page
      .getByLabel("가치 판단 답변")
      .fill(
        "내가 중요하게 생각하는 가치와 화자의 태도를 비교하는 작성 중인 글입니다.",
      );
    await page.reload();
    await expect(page.getByLabel("가치 판단 답변")).toHaveValue(
      "내가 중요하게 생각하는 가치와 화자의 태도를 비교하는 작성 중인 글입니다.",
    );
    expect(
      await page.locator(".deep-question-card h2").allTextContents(),
    ).toEqual(questions);
    expect(errors).toEqual([]);
  });
}
