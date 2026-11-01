import { test, expect } from "./fixtures.js";
import { readFile } from "node:fs/promises";
test("teacher question, student QR response, final background summary and next stage", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/teacher/activity/demo-dongbaek/background");
  await page.getByRole("button", { name: "배경 탐구 시작" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "단계 변경" })
    .click();
  await expect(
    page.getByRole("button", { name: "다음: 인물·사건 분석" }),
  ).toBeVisible();
  await page
    .getByLabel("학생들에게 보낼 질문")
    .fill("봄이라는 시간적 배경을 알 수 있는 본문 속 단서는 무엇인가요?");
  await page.getByRole("button", { name: "질문 공개하기" }).click();
  await expect(
    page.locator(".question-card").filter({
      hasText: "봄이라는 시간적 배경을 알 수 있는 본문 속 단서는 무엇인가요?",
    }),
  ).toBeVisible();
  const student = await context.newPage();
  await student.setViewportSize({ width: 390, height: 844 });
  await student.goto("/activity/demo-dongbaek-analysis");
  await expect(
    student.getByRole("heading", {
      name: "봄이라는 시간적 배경을 알 수 있는 본문 속 단서는 무엇인가요?",
    }),
  ).toBeVisible();
  await student.getByLabel("학생 번호 또는 별칭").fill("배경 테스트");
  await student
    .getByLabel("본문을 바탕으로 나의 생각 쓰기")
    .fill(
      "노란 동백꽃이 피고 농사일을 하는 모습에서 봄이라는 것을 짐작했어요.",
    );
  await student.getByRole("button", { name: "내 응답 보내기" }).click();
  await expect(
    student
      .getByRole("status")
      .filter({ hasText: "선생님께 응답을 보냈어요." }),
  ).toBeVisible();
  const card = page.locator(".question-card").filter({
    hasText: "봄이라는 시간적 배경을 알 수 있는 본문 속 단서는 무엇인가요?",
  });
  await expect(card).toContainText("노란 동백꽃이 피고 농사일");
  await card
    .getByLabel("선생님의 최종 정리")
    .fill(
      "노란 봄꽃과 농사일을 단서로 봄철의 농촌이라는 시간적 배경을 정리할 수 있습니다.",
    );
  await card.getByRole("button", { name: "최종 정리 공유" }).click();
  await expect(card).toContainText("응답 마감");
  await expect(student.locator(".teacher-summary")).toContainText(
    "봄철의 농촌",
  );
  await page.getByRole("combobox", { name: "탐구할 배경" }).click();
  await page.getByRole("option", { name: "공간적 배경", exact: true }).click();
  await page
    .getByLabel("학생들에게 보낼 질문")
    .fill("인물들의 생활 공간이 농촌임을 알 수 있는 단서는 무엇인가요?");
  await page.getByRole("button", { name: "질문 공개하기" }).click();
  await student.getByRole("tab", { name: "공간적 배경", exact: true }).click();
  await expect(
    student.getByRole("heading", {
      name: "인물들의 생활 공간이 농촌임을 알 수 있는 단서는 무엇인가요?",
    }),
  ).toBeVisible();
  await student
    .getByLabel("본문을 바탕으로 나의 생각 쓰기")
    .fill("산기슭과 밭이 등장하고 인물들이 농사일을 하는 장소이기 때문입니다.");
  await student.getByRole("button", { name: "내 응답 보내기" }).click();
  const spatial = page.locator(".question-card").filter({
    hasText: "인물들의 생활 공간이 농촌임을 알 수 있는 단서는 무엇인가요?",
  });
  await expect(spatial).toContainText("산기슭과 밭이 등장");
  await spatial
    .getByLabel("선생님의 최종 정리")
    .fill("인물들의 공간은 산기슭과 밭을 중심으로 한 농촌 마을입니다.");
  await spatial.getByRole("button", { name: "최종 정리 공유" }).click();
  await expect(student.locator(".teacher-summary")).toContainText(
    "산기슭과 밭",
  );
  await page.screenshot({
    path: "test-results/screenshots/background-teacher.png",
    fullPage: true,
  });
  await student.screenshot({
    path: "test-results/screenshots/background-student.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "다음: 인물·사건 분석" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "단계 변경" })
    .click();
  await expect(
    student.getByRole("button", { name: "나의 해석 시작하기" }),
  ).toBeVisible();
  await student.getByText("함께 정리한 작품의 배경").click();
  await expect(student.locator(".background-summary")).toContainText(
    "봄철의 농촌",
  );
  await student.close();
  await page.goto("/teacher/activity/demo-dongbaek/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "데이터 내보내기" }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(
    exported.background_responses.some(
      (r) => r.student_label === "배경 테스트",
    ),
  ).toBe(true);
  expect(
    exported.background_questions.some((q) =>
      q.summary.includes("봄철의 농촌"),
    ),
  ).toBe(true);
  expect(exported.activity.worksheet_token).toBeUndefined();
  expect(
    exported.worksheets.every(
      (w) => !w.submission_code && !w.submission_code_hash,
    ),
  ).toBe(true);
  expect(
    exported.background_responses.every((r) => !r.code && !r.respondent_hash),
  ).toBe(true);
});
