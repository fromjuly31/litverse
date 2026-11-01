import { test, expect } from "./fixtures.js";
import { mkdir } from "node:fs/promises";

async function choose(page, label, option) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function analyze(page, title = "운수 좋은 날", author = "현진건") {
  await page.getByLabel("문학 작품명", { exact: true }).fill(title);
  await page.getByLabel("작가명", { exact: true }).fill(author);
  await page
    .getByRole("button", { name: "작품 분석하기", exact: true })
    .click();
  await expect(page.locator("#deep-review")).toBeVisible();
}
async function confirmAnalysis(page) {
  await page.locator('[name="reviewed"]').check();
  await page
    .getByRole("button", { name: "이 분석으로 수업 만들기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "심화 활동 시작", exact: true }),
  ).toBeVisible();
}
async function startAndLink(page) {
  await page
    .getByRole("button", { name: "심화 활동 시작", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "심화 활동 종료", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "학생 참여 QR", exact: true }).click();
  const link = await page
    .getByRole("link", { name: "학생 화면 열기", exact: true })
    .getAttribute("href");
  await page.keyboard.press("Escape");
  return link;
}
async function joinAndJudge(page) {
  await page.getByLabel("학생 번호 또는 별칭", { exact: true }).fill("01번");
  await page
    .getByRole("button", { name: "심화 활동 참여하기", exact: true })
    .click();
  await page
    .getByLabel("나의 선택", { exact: true })
    .fill("아내 곁에 머물며 돌본다");
  await page
    .getByLabel("선택한 이유", { exact: true })
    .fill("가족의 건강과 돌봄을 먼저 고려했기 때문입니다.");
  await page
    .getByLabel("작품 속 판단 근거", { exact: true })
    .fill("아내가 병들어 있으며 함께 있어 달라고 하는 상황을 고려했습니다.");
  await page
    .getByRole("button", { name: "최초 판단 제출하고 질문 받기" })
    .click();
  await expect(page.getByLabel("현실과 맥락 탐구 답변")).toBeVisible();
}
test("standalone deepening: personalized questions, durable answers, live teacher progress, peers and public reflection", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("test-results/deepening", { recursive: true });
  await page.goto("/teacher?tab=deepening");
  await page
    .getByRole("link", { name: "심화 수업 만들기", exact: true })
    .click();
  await analyze(page);
  await confirmAnalysis(page);
  const teacherUrl = page.url(),
    id = teacherUrl.split("/").at(-2),
    link = await startAndLink(page);
  const student = await context.newPage();
  student.on("pageerror", (e) => errors.push(e.message));
  await student.setViewportSize({ width: 390, height: 844 });
  await student.goto(link);
  await joinAndJudge(student);
  const originalQuestions = await student
    .locator(".deep-question-card h2")
    .allTextContents();
  const contextAnswer =
    "가난과 돌봄 자원이 부족한 시대적 조건을 함께 살펴보아야 한다고 생각합니다.";
  await student.getByLabel("현실과 맥락 탐구 답변").fill(contextAnswer);
  await student.reload();
  await expect(student.getByLabel("현실과 맥락 탐구 답변")).toHaveValue(
    contextAnswer,
  );
  expect(
    await student.locator(".deep-question-card h2").allTextContents(),
  ).toEqual(originalQuestions);
  await student
    .getByLabel("가치 판단 답변")
    .fill(
      "생계와 돌봄의 책임을 함께 고려하면 개인의 선택을 단순히 비난하기 어렵습니다.",
    );
  await student
    .getByLabel("문학과 삶 연결 답변")
    .fill(
      "오늘날에는 가족 돌봄을 개인만이 아니라 공동체가 함께 지원할 필요가 있습니다.",
    );
  await student.screenshot({
    path: "test-results/deepening/student-questions-mobile.png",
    fullPage: true,
  });
  expect(
    await student.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await student.getByRole("button", { name: "세 답변 제출" }).click();
  await expect(
    student.getByText("세 답변을 저장했습니다.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("#deep-progress")).toContainText("세 답변 1명");
  const second = await page.evaluate(async (id) => {
    const { request } = await import("/src/services/api.js");
    const { randomCode } = await import("/src/utils/helpers.js");
    const token = (await request("teacher/links", { id })).worksheet_token,
      code = randomCode();
    const credentials = { token, code };
    let data = await request("deepening/student-join", {
        ...credentials,
        student_label: "02번",
      }),
      r = data.record;
    const initial = {
      choice: "생계를 위해 일을 나간다",
      reason: "생활비와 치료비를 마련해야 한다고 생각하기 때문입니다.",
      evidence: "가족의 생계가 인력거 수입에 달려 있는 상황을 고려했습니다.",
    };
    r = await request("deepening/student-write", {
      ...credentials,
      operation: "initial",
      data: initial,
      revision: r.revision,
    });
    r = await request("deepening/student-questions", credentials);
    for (const purpose of ["context", "values", "life"])
      r = await request("deepening/student-write", {
        ...credentials,
        operation: "answer",
        data: {
          purpose,
          answer:
            "상대의 입장과 경제적 조건을 고려하며 본문에 근거해 생각했습니다.",
        },
        revision: r.revision,
      });
    await request("deepening/student-write", {
      ...credentials,
      operation: "submit-answers",
      data: {},
      revision: r.revision,
    });
    return r.questions;
  }, id);
  expect(second.context).not.toBe(originalQuestions[0]);
  await expect(page.locator("#deep-progress")).toContainText("참여 2명");
  await choose(page, "결과 공개 범위", "같은 수업에서 감상");
  await page.getByRole("button", { name: "공개 범위 적용" }).click();
  await expect(student.locator(".perspective-card")).toHaveCount(1);
  await student.locator(".perspective-card").click();
  await expect(student.getByRole("dialog")).toContainText(
    "생계를 위해 일을 나간다",
  );
  await student.keyboard.press("Escape");
  await student.getByRole("button", { name: "감상 마치고 성찰하기" }).click();
  await student
    .getByLabel("기존 생각이 더 깊어지고 확장되었다", { exact: true })
    .check();
  const reflection =
    "돌봄을 우선한다는 생각은 유지하지만, 일을 하지 못하면 생계가 어려운 현실과 공동체의 지원도 함께 고려해야 한다는 점을 발견했습니다.";
  await student.getByLabel("최종 성찰", { exact: true }).fill(reflection);
  await student.reload();
  await expect(student.getByLabel("최종 성찰", { exact: true })).toHaveValue(
    reflection,
  );
  await student.getByRole("button", { name: "최종 성찰 완료" }).click();
  await expect(student.locator(".reflection-pair").first()).toContainText(
    reflection,
  );
  await expect(page.locator("#deep-progress")).toContainText("성찰 완료 1명");
  await page.screenshot({
    path: "test-results/deepening/teacher-progress.png",
    fullPage: true,
  });
  await choose(page, "결과 공개 범위", "문학 전시관에 공개");
  await page.getByRole("button", { name: "공개 범위 적용" }).click();
  await page
    .getByRole("button", { name: "전시관에 공개", exact: true })
    .click();
  await student.goto("/exhibition?type=deepening");
  await expect(student.locator(".deep-exhibit-frame")).toHaveCount(1);
  await student.locator(".deep-exhibit-frame").click();
  await expect(student.locator(".perspective-card")).toHaveCount(1);
  await student.locator(".perspective-card").click();
  await expect(student.getByRole("dialog")).toContainText(reflection);
  await expect(student.getByRole("dialog")).not.toContainText("01번");
  await student.keyboard.press("Escape");
  await student.goto("/");
  await expect(student.locator(".inventory-summary")).toHaveText(
    "전시 중인 작품1점",
  );
  await choose(page, "결과 공개 범위", "교사만 보기");
  await page.getByRole("button", { name: "공개 범위 적용" }).click();
  await student.goto("/exhibition?type=deepening");
  await expect(student.locator(".deep-exhibit-frame")).toHaveCount(0);
  await page
    .getByRole("button", { name: "심화 활동 종료", exact: true })
    .click();
  await page
    .getByRole("button", { name: "새 회차 만들기", exact: true })
    .click();
  await page.locator('[name="reviewed"]').check();
  await page.getByRole("button", { name: "새 회차로 보관하기" }).click();
  await expect(page.getByRole("combobox", { name: "활동 회차" })).toContainText(
    "2회차",
  );
  await choose(page, "활동 회차", "1회차 · 종료");
  await expect(page.locator("#deep-progress")).toContainText("성찰 완료 1명");
  await page
    .getByRole("navigation", { name: "수업 분야", exact: true })
    .getByRole("link", { name: "작품 파악하기" })
    .click();
  await expect(
    page.getByRole("link", { name: "수업 만들기", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await student.close();
});

test("linked lessons retain worksheets and QR identity while switching without losing unsaved text", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/teacher/activity/demo-dongbaek/background");
  const original = await page.evaluate(async () => {
    const { request } = await import("/src/services/api.js");
    const d = await request("teacher/get", { id: "demo-dongbaek" });
    return {
      worksheets: d.worksheets,
      images: d.images,
      stage: d.activity.stage,
    };
  });
  const student = await context.newPage();
  student.on("pageerror", (e) => errors.push(e.message));
  await student.goto("/activity/demo-dongbaek-analysis");
  await student
    .getByRole("button", { name: "나의 해석 시작하기", exact: true })
    .click();
  await student.getByLabel("학생 번호 또는 별칭").fill("새 관점");
  await student
    .getByRole("button", { name: "나의 해석 시작하기", exact: true })
    .click();
  const character = student.getByLabel("분석할 인물", { exact: true });
  // The field name is stable across the existing character form.
  const nameField = student.locator('[name="character_name"]');
  await nameField.fill("작성 중인 인물 해석");
  await page
    .getByRole("navigation", { name: "수업 분야", exact: true })
    .getByRole("link", { name: "이해 심화하기" })
    .click();
  await expect(page.getByLabel("문학 작품명", { exact: true })).toHaveValue(
    "동백꽃",
  );
  await expect(page.getByLabel("작가명", { exact: true })).toHaveValue(
    "김유정",
  );
  await analyze(page, "동백꽃", "김유정");
  await confirmAnalysis(page);
  await startAndLink(page);
  await expect(student.locator(".student-phase-notice")).toContainText(
    "이해 심화하기",
  );
  await expect(nameField).toHaveValue("작성 중인 인물 해석");
  await student.getByRole("link", { name: "심화 활동으로 이동" }).click();
  await expect(student.getByLabel("학생 번호 또는 별칭")).toHaveValue(
    "새 관점",
  );
  await student
    .getByRole("button", { name: "심화 활동 참여하기", exact: true })
    .click();
  await expect(student.getByLabel("나의 선택", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "학생에게 작품 파악 안내" }).click();
  await expect(student.locator(".student-phase-notice")).toContainText(
    "작품 파악하기",
  );
  await student
    .getByRole("link", { name: "작품 파악으로 이동", exact: true })
    .click();
  await student.getByRole("button", { name: "작성하던 해석 이어가기" }).click();
  await expect(nameField).toHaveValue("작성 중인 인물 해석");
  const after = await page.evaluate(async () => {
    const { request } = await import("/src/services/api.js");
    const d = await request("teacher/get", { id: "demo-dongbaek" });
    return {
      worksheets: d.worksheets,
      images: d.images,
      stage: d.activity.stage,
    };
  });
  expect(after).toEqual(original);
  expect(errors).toEqual([]);
  await student.close();
});

test("poetry and uncertain works use distinct drafts and teaching-tab preference is remembered", async ({
  page,
}) => {
  await page.goto("/teacher?tab=deepening");
  await page.getByRole("link", { name: "관람하기", exact: true }).click();
  await page.getByRole("link", { name: "수업하기", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "심화 수업 만들기", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "심화 수업 만들기", exact: true })
    .click();
  await analyze(page, "서시", "윤동주");
  await expect(page.getByRole("combobox", { name: "문학 갈래" })).toHaveText(
    "시",
  );
  await expect(page.getByLabel("최초 판단 질문")).toHaveValue(/화자/);
  await analyze(page, "확인되지 않은 문학 작품", "미상");
  await expect(page.locator("#deep-review .notice")).toContainText(
    "확실히 식별하지 못했습니다",
  );
  await expect(page.getByLabel("주요 인물 또는 화자")).toHaveValue("");
  await page
    .getByRole("button", { name: "이 분석으로 수업 만들기", exact: true })
    .click();
  await expect(page.locator("#deep-review")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "심화 활동 시작", exact: true }),
  ).toHaveCount(0);
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});
