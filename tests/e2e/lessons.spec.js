import { test, expect } from "./fixtures.js";
import { mkdir } from "node:fs/promises";

const tabs = (page) =>
  page.getByRole("navigation", { name: "수업 활동", exact: true });
async function createLesson(page, title) {
  await page.getByRole("link", { name: "수업 만들기", exact: true }).click();
  await expect(tabs(page)).toHaveCount(0);
  await page.getByLabel("작품 제목").fill(title);
  await page.getByLabel("작가", { exact: true }).fill("수업 작가");
  await page.getByLabel("수업명", { exact: true }).fill(`${title} 함께 읽기`);
  await page.getByLabel("학급명").fill("1학년 2반");
  await page
    .getByLabel("수업 소개", { exact: true })
    .fill("본문의 근거로 배경, 인물과 사건을 함께 읽습니다.");
  await page
    .getByLabel("수업 비밀번호", { exact: true })
    .fill("lesson-test-password");
  await page
    .getByLabel("비밀번호 확인", { exact: true })
    .fill("lesson-test-password");
  await page.getByRole("button", { name: "수업 만들기", exact: true }).click();
  await expect(tabs(page).getByRole("link")).toHaveCount(3);
  await expect(
    tabs(page).getByRole("link", { name: "배경 탐구" }),
  ).toHaveAttribute("aria-current", "page");
  return page.url().replace(/\/background$/, "");
}

test("classroom creates isolated lesson projects and restores saved settings", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/teacher$/);
  await page.evaluate(async () => {
    const { request: demoRequest } = await import("/src/services/api.js");
    for (const activity of await demoRequest("teacher/list")) {
      await demoRequest("teacher/delete-activity", { id: activity.id });
    }
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "첫 번째 수업을 만들어 보세요." }),
  ).toBeVisible();
  await expect(page.locator(".lesson-card")).toHaveCount(0);
  await expect(tabs(page)).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "전시관 메뉴", exact: true })
      .getByRole("link"),
  ).toHaveCount(3);
  await expect(
    page.getByRole("link", { name: "대시보드", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".mobile-nav, .lesson-resume")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "수업 만들기", exact: true }),
  ).toHaveCount(1);

  const first = await createLesson(page, "첫 번째 작품");
  await page
    .getByLabel("학생들에게 보낼 질문")
    .fill("첫 번째 작품의 시대적 배경은 무엇인가요?");
  await page.getByRole("button", { name: "질문 공개하기" }).click();
  await expect(page.locator(".question-card")).toHaveCount(1);
  await tabs(page).getByRole("link", { name: "등장인물 갤러리" }).click();
  await expect(page.locator(".art-card")).toHaveCount(0);
  await tabs(page).getByRole("link", { name: "사건 분석" }).click();
  await expect(page.locator(".scene-record")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "학생들의 첫 사건 분석을 기다리고 있어요.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "수업 설정", exact: true }).click();
  await page
    .getByRole("button", { name: "수업 정보 수정", exact: true })
    .click();
  await page
    .getByLabel("수업 목표", { exact: true })
    .fill("본문 근거를 중심으로 세 가지 관점을 비교한다.");
  await page.getByRole("button", { name: "변경 사항 저장" }).click();
  await expect(page).toHaveURL(`${first}/settings`);
  await page.reload();
  await expect(
    page.getByText("본문 근거를 중심으로 세 가지 관점을 비교한다.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "수업하기", exact: true }).click();
  await expect(tabs(page)).toHaveCount(0);
  await expect(page.locator(".lesson-card")).toHaveCount(1);

  const second = await createLesson(page, "두 번째 작품");
  expect(second).not.toBe(first);
  await expect(page.locator(".question-card")).toHaveCount(0);
  await page.getByRole("link", { name: "수업하기", exact: true }).click();
  await expect(page.locator(".lesson-card")).toHaveCount(2);
  await page
    .getByRole("link", { name: "첫 번째 작품 수업 열기", exact: true })
    .click();
  await expect(page.locator(".question-card")).toContainText(
    "첫 번째 작품의 시대적 배경은 무엇인가요?",
  );
  await page.getByRole("link", { name: "수업하기", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "첫 번째 작품 수업 열기", exact: true }),
  ).toHaveAttribute("href", `${new URL(first).pathname}/background`);
  await page.getByRole("link", { name: "수업 만들기", exact: true }).click();
  await expect(tabs(page)).toHaveCount(0);
  await page.getByRole("link", { name: "취소", exact: true }).click();
  await expect(page.locator(".lesson-card")).toHaveCount(2);
  const menu = page.getByRole("navigation", {
    name: "전시관 메뉴",
    exact: true,
  });
  await expect(
    menu.getByRole("link", { name: "수업하기", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await menu.getByRole("link", { name: "관람하기", exact: true }).click();
  await expect(page).toHaveURL(/\/exhibition$/);
  await expect(
    menu.getByRole("link", { name: "관람하기", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("link", { name: "LITVERSE 처음으로", exact: true })
    .click();
  await expect(page.locator(".museum-choices > a")).toHaveCount(2);
  await menu.getByRole("link", { name: "수업하기", exact: true }).click();
  await expect(page.locator(".lesson-card")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("project tabs separate portraits and scene analysis, including records without pictures", async ({
  page,
}) => {
  await page.goto("/teacher/activity/demo-dongbaek/gallery");
  await expect(
    page.locator('.art-card[data-image-type="character"]'),
  ).toHaveCount(12);
  await expect(page.locator('.art-card[data-image-type="scene"]')).toHaveCount(
    0,
  );
  await tabs(page).getByRole("link", { name: "사건 분석" }).click();
  await expect(page.locator(".scene-record")).toHaveCount(18);
  await expect(page.locator('.art-card[data-image-type="scene"]')).toHaveCount(
    8,
  );
  await expect(
    page.locator('.art-card[data-image-type="character"]'),
  ).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "작품 검색" })
    .fill("점순이가 나에게 감자를 건네는 사건");
  await expect(page.locator(".art-card")).toHaveCount(8);
  await expect(page.locator(".scene-record")).toHaveCount(18);
  await page.getByRole("searchbox", { name: "작품 검색" }).fill("");
  const record = page
    .locator(".scene-record")
    .filter({ hasText: "장면 제출 전" })
    .first();
  await record.locator("summary").click();
  await expect(record.locator("dl")).toContainText("본문에 나타난 사건의 전개");
  await expect(record.locator("dl")).toContainText("감자를");
  await page.getByRole("searchbox", { name: "작품 검색" }).fill("18번");
  await expect(page.locator(".scene-record")).toHaveCount(1);
  await expect(page.locator(".art-card")).toHaveCount(0);
  await page.reload();
  await expect(
    tabs(page).getByRole("link", { name: "사건 분석" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".scene-record")).toHaveCount(18);

  await mkdir("test-results/lessons", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/teacher",
      "/teacher/activities/new",
      "/teacher/activity/demo-dongbaek/scenes",
    ]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
    if (width === 390) {
      await page.screenshot({
        path: "test-results/lessons/scenes-mobile.png",
        fullPage: true,
      });
      await page.goto("/teacher");
      await expect(page.locator(".lesson-card").first()).toBeVisible();
      await page.screenshot({
        path: "test-results/lessons/dashboard-mobile.png",
        fullPage: true,
      });
    }
  }
});
