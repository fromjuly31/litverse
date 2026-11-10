import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const step = (page, number) =>
  page.getByRole("tab", { name: new RegExp(`^${number}단계`) });
const next = (page) =>
  page.getByRole("button", { name: "다음 단계", exact: true });

test("guided lesson creation keeps input, validates passwords, and reopens with four characters", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/teacher/activities/new");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(page.getByLabel("학급명")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "수업 만들기", exact: true }),
  ).toHaveCount(0);
  await next(page).click();
  await expect(page.getByLabel("작품 제목")).toBeFocused();
  await page.getByLabel("작품 제목").fill("동백꽃");
  await page.getByLabel("작가", { exact: true }).fill("김유정");
  await page
    .getByLabel("수업명", { exact: true })
    .fill("함께 읽는 봄날의 이야기");
  await page
    .getByLabel("수업 소개", { exact: true })
    .fill("말과 행동에 담긴 두 인물의 마음을 읽어요.");
  await next(page).click();
  await expect(step(page, 2)).toHaveAttribute("aria-selected", "true");
  await page
    .getByLabel("작품 줄거리", { exact: true })
    .fill("소년과 점순이의 서툰 마음이 봄날의 농촌에서 펼쳐진다.");
  await expect(page.getByLabel("수업 목표", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("교과 성취기준", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "이전 단계" }).click();
  await expect(page.getByLabel("수업명", { exact: true })).toHaveValue(
    "함께 읽는 봄날의 이야기",
  );
  await step(page, 2).focus();
  await page.keyboard.press("ArrowRight");
  await expect(step(page, 3)).toBeFocused();
  await expect(step(page, 3)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("기본 성격 키워드")).toHaveCount(0);
  await expect(page.getByLabel("질문 1", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("질문 1", { exact: true })).toHaveAttribute(
    "placeholder",
    "내가 파악한 인물의 특징은?",
  );
  await page
    .getByLabel("질문 1", { exact: true })
    .fill("사진 속 인물의 특징은?");
  await page.getByRole("button", { name: "질문 추가", exact: true }).click();
  await page
    .getByLabel("질문 2", { exact: true })
    .fill("어떤 장면을 표현했나요?");
  await page.getByRole("button", { name: "질문 추가", exact: true }).click();
  await page
    .getByLabel("질문 3", { exact: true })
    .fill("작품 속 근거는 무엇인가요?");
  await expect(
    page.getByRole("button", { name: "질문 추가", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "질문 3 삭제", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "질문 추가", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("질문 2", { exact: true })).toHaveValue(
    "어떤 장면을 표현했나요?",
  );
  await next(page).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "4",
  );
  await expect(page.locator("#lesson-review")).toContainText(
    "함께 읽는 봄날의 이야기",
  );
  const password = page.getByLabel("수업 비밀번호", { exact: true });
  const confirmation = page.getByLabel("비밀번호 확인", { exact: true });
  await expect(password).toHaveAttribute("minlength", "4");
  await expect(
    page.getByText("4자리 이상 · 숫자와 문자를 사용할 수 있어요."),
  ).toBeVisible();
  await password.fill("123");
  await confirmation.fill("123");
  await page.getByRole("button", { name: "수업 만들기", exact: true }).click();
  await expect(page.locator("#editor-error")).toContainText("4~128자");
  await password.fill("1234");
  await confirmation.fill("4321");
  await page.getByRole("button", { name: "수업 만들기", exact: true }).click();
  await expect(page.locator("#editor-error")).toContainText("일치하지");
  await confirmation.fill("1234");
  await page
    .getByRole("button", { name: "수업 비밀번호 표시", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "수업 비밀번호 숨기기", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "수업 만들기", exact: true }).click();
  await expect(page).toHaveURL(/\/teacher\/activity\/[^/]+\/background$/);
  const created = page.url();
  await expect(page.locator(".lesson-context")).toContainText(
    "함께 읽는 봄날의 이야기",
  );
  await expect(page.locator(".lesson-context")).not.toContainText(
    "학급 미지정",
  );
  await page.goto("/teacher");
  await page.goto(created);
  await expect(
    page.getByRole("button", { name: "수업 열기", exact: true }),
  ).toBeVisible();
  await page.getByLabel("수업 비밀번호", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "수업 열기", exact: true }).click();
  await expect(page.locator(".lesson-context")).toBeVisible();
  await page.getByRole("link", { name: "수업 설정", exact: true }).click();
  await page
    .getByRole("button", { name: "수업 정보 수정", exact: true })
    .click();
  await step(page, 2).click();
  await expect(page.getByLabel("작품 줄거리", { exact: true })).toHaveValue(
    "소년과 점순이의 서툰 마음이 봄날의 농촌에서 펼쳐진다.",
  );
  await page
    .getByLabel("작품 줄거리", { exact: true })
    .fill("다른 관점과 나의 해석을 비교한다.");
  await step(page, 4).click();
  await expect(page.getByLabel("수업 비밀번호", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "변경 사항 저장" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByText("다른 관점과 나의 해석을 비교한다.", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("submission returns to missing steps and does not save the example as a question", async ({
  page,
}) => {
  await page.goto("/teacher/activities/new");
  await step(page, 4).click();
  await page.getByLabel("수업 비밀번호", { exact: true }).fill("1234");
  await page.getByLabel("비밀번호 확인", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "수업 만들기", exact: true }).click();
  await expect(step(page, 1)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("작품 제목")).toBeFocused();
  await page.getByLabel("작품 제목").fill("작품");
  await page.getByLabel("작가", { exact: true }).fill("작가");
  await page.getByLabel("수업 소개", { exact: true }).fill("소개");
  await page.getByLabel("예상 참여 인원").fill("1001");
  await next(page).click();
  await expect(page.locator("#editor-error")).toContainText("1~1,000");
  await page.getByLabel("예상 참여 인원").fill("30");
  await step(page, 3).click();
  await next(page).click();
  await expect(page.locator("#editor-error")).toContainText("질문을 하나 이상");
  await expect(page.getByLabel("질문 1", { exact: true })).toBeFocused();
  await expect(page.getByLabel("질문 1", { exact: true })).toHaveValue("");
  await page
    .getByLabel("질문 1", { exact: true })
    .fill("사진에서 어떤 특징을 표현했나요?");
  await next(page).click();
  await expect(step(page, 4)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("수업 비밀번호", { exact: true })).toHaveValue(
    "1234",
  );
});

test("all editor steps fit mobile, tablet, and large desktop widths with aligned controls", async ({
  page,
}) => {
  await mkdir("test-results/editor", { recursive: true });
  await page.goto("/teacher/activities/new");
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (let number = 1; number <= 4; number++) {
      await step(page, number).click();
      await expect(page.getByRole("tabpanel")).toHaveCount(1);
      const layout = await page.evaluate(() => {
        const form = document
          .querySelector(".lesson-wizard")
          .getBoundingClientRect();
        const main = document
          .querySelector(".teacher-main")
          .getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          width: form.width,
          mainWidth: main.width,
          controlsFit: [
            ...document.querySelectorAll(
              ".wizard-step:not([hidden]) input:not([type=hidden]), .wizard-footer .btn:not([hidden])",
            ),
          ].every((node) => {
            const r = node.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth;
          }),
        };
      });
      expect(layout.overflow, `${width}px, step ${number}`).toBe(false);
      expect(layout.controlsFit, `${width}px, step ${number}`).toBe(true);
      expect(Math.abs(layout.width - layout.mainWidth)).toBeLessThan(2);
      if (number === 1 && width > 600) {
        const count = await page.getByLabel("예상 참여 인원").boundingBox();
        const style = await page
          .getByRole("combobox", { name: "기본 이미지 스타일" })
          .boundingBox();
        expect(Math.abs(count.y - style.y)).toBeLessThan(2);
        expect(Math.abs(count.height - style.height)).toBeLessThan(2);
      }
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `test-results/editor/${width}-step-${number}.png`,
          fullPage: true,
        });
    }
  }
});
