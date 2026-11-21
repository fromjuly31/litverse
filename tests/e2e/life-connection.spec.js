import { test, expect } from "./fixtures.js";

test("the life connection tab opens one question and receives an article, summary and answer through its QR", async ({
  page,
  context,
}) => {
  const lesson = "/teacher/activity/demo-dongbaek";
  await page.goto(`${lesson}/deepening`);
  const tabs = page.getByRole("navigation", { name: "수업 분야" });
  await expect(tabs.getByRole("link")).toHaveText([
    "작품 파악하기",
    "이해 심화하기",
    "삶과 연계하기",
  ]);
  await page.setViewportSize({ width: 320, height: 720 });
  const life = tabs.getByRole("link", { name: "삶과 연계하기" });
  await life.click();
  await expect(page).toHaveURL(new RegExp(`${lesson}/life$`));
  await expect(life).toHaveAttribute("aria-current", "page");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(321);

  const question = "우리 주변에서 오해를 줄이려면 어떤 대화가 필요할까요?";
  await page.getByLabel("삶과 연계하는 질문").fill(question);
  await page.getByRole("button", { name: "시작하기", exact: true }).click();
  const qr = page.getByRole("dialog", { name: "삶과 연계하기 참여" });
  await expect(qr.getByRole("img")).toBeVisible();
  const link = await qr
    .getByRole("link", { name: "학생 화면 열기" })
    .getAttribute("href");
  expect(link).toContain("/activity/demo-dongbaek-analysis/life");
  await page.keyboard.press("Escape");

  const student = await context.newPage();
  await student.setViewportSize({ width: 390, height: 844 });
  await student.goto(link);
  await expect(student.getByText(question, { exact: true })).toBeVisible();
  const bigKinds = student.getByRole("link", {
    name: "빅카인즈에서 기사 찾기",
  });
  await expect(bigKinds).toHaveAttribute("href", "https://www.bigkinds.or.kr/");
  await expect(bigKinds).toHaveAttribute("target", "_blank");
  const article = "https://news.example.org/classroom-conversations";
  const summary = "학교가 친구 사이 오해를 줄이기 위해 대화 모임을 열었습니다.";
  const answer = "상대의 행동을 단정하기 전에 이유를 묻는 대화가 필요합니다.";
  await student.getByLabel("뉴스 기사 링크").fill(article);
  await student.getByLabel("뉴스 기사 요약").fill(summary);
  await student.getByRole("button", { name: "답변 제출하기" }).click();
  await expect(student.getByLabel("질문에 대한 답변")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await student.reload();
  await expect(student.getByLabel("뉴스 기사 요약")).toHaveValue(summary);
  await student.getByLabel("질문에 대한 답변").fill(answer);
  await student.getByRole("button", { name: "답변 제출하기" }).click();
  await expect(student.getByText("답변을 제출했어요.")).toBeVisible();

  await page.bringToFront();
  await expect(page.getByText("1명 제출", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await page.locator("#life-responses summary").click();
  await expect(page.getByText(summary, { exact: true })).toBeVisible();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "첨부 기사 열기" }),
  ).toHaveAttribute("href", article);
  await page.getByRole("button", { name: "마감하기" }).click();
  await expect(page.getByText("답변 접수 마감", { exact: true })).toBeVisible();
  await student.reload();
  await expect(student.getByText("답변을 제출했어요.")).toBeVisible();
  await student.close();
});
