import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const tabs = (page) =>
  page.getByRole("navigation", { name: "수업 활동", exact: true });
const entries = [
  ["root site", "http://127.0.0.1:4174/"],
  ["repository subdirectory", "http://127.0.0.1:4174/preview-repository/"],
  ["standalone HTML file", pathToFileURL(resolve("release/index.html")).href],
];

for (const [name, entry] of entries) {
  test(`${name}: create a class, reload, reopen links and view embedded artwork`, async ({
    page,
    context,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // The standalone copy must work even if external font services are unavailable.
    await context.route(/^https:\/\/(?:fonts\.|cdn\.jsdelivr\.net)/, (route) =>
      route.abort(),
    );
    await page.goto(entry);
    await expect(page.locator(".museum-choices>a")).toHaveCount(2);
    await page
      .locator(".museum-choice img")
      .evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
    for (const [width, height] of [
      [390, 844],
      [844, 390],
      [1366, 768],
    ]) {
      await page.setViewportSize({ width, height });
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollHeight <= innerHeight + 1 &&
            document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
    if (entry.startsWith("file:"))
      await expect(page.locator(".choice-visit img")).toHaveAttribute(
        "src",
        /^data:image\/webp;base64,/,
      );
    await page.locator(".choice-class").click();
    await expect(
      page.getByRole("heading", { name: "우리의 문학 수업" }),
    ).toBeVisible();
    await expect(page).toHaveURL(`${entry}#/teacher`);
    await expect(tabs(page)).toHaveCount(0);
    const dashboardUrl = page.url();
    await page.locator(".skip-link").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(dashboardUrl);
    await page.getByRole("link", { name: "수업 만들기", exact: true }).click();
    await page.getByLabel("작품 제목").fill("HTML 배포 수업");
    await page.getByLabel("작가", { exact: true }).fill("테스트 작가");
    await page
      .getByLabel("수업 소개", { exact: true })
      .fill("배경과 인물과 사건을 읽는 정적 HTML 수업입니다.");
    await page
      .getByLabel("수업 비밀번호", { exact: true })
      .fill("pages-test-password");
    await page
      .getByLabel("비밀번호 확인", { exact: true })
      .fill("pages-test-password");
    await page
      .getByRole("button", { name: "수업 만들기", exact: true })
      .click();
    await expect(tabs(page).getByRole("link")).toHaveCount(3);
    await expect(page).toHaveURL(/#\/teacher\/activity\/[^/]+\/background$/);
    await page
      .getByLabel("학생들에게 보낼 질문")
      .fill("이 작품의 공간적 배경은 어디인가요?");
    await page.getByRole("button", { name: "질문 공개하기" }).click();
    await expect(page.locator(".question-card")).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".question-card")).toContainText("공간적 배경");
    await tabs(page).getByRole("link", { name: "등장인물 갤러리" }).click();
    await tabs(page).getByRole("link", { name: "사건 분석" }).click();
    await page.goBack();
    await expect(
      tabs(page).getByRole("link", { name: "등장인물 갤러리" }),
    ).toHaveAttribute("aria-current", "page");
    await page.goForward();
    await expect(
      tabs(page).getByRole("link", { name: "사건 분석" }),
    ).toHaveAttribute("aria-current", "page");
    const link = await tabs(page)
      .getByRole("link", { name: "배경 탐구" })
      .getAttribute("href");
    const otherTab = await context.newPage();
    await otherTab.goto(new URL(link, page.url()).href);
    await otherTab
      .getByLabel("수업 비밀번호", { exact: true })
      .fill("pages-test-password");
    await otherTab
      .getByRole("button", { name: "수업 열기", exact: true })
      .click();
    await expect(otherTab.locator(".question-card")).toContainText(
      "공간적 배경",
    );
    await otherTab.close();

    await page.goto(`${entry}#/teacher/activity/demo-dongbaek/gallery`);
    await page
      .getByLabel("수업 비밀번호", { exact: true })
      .fill("sample-password");
    await page
      .getByLabel("비밀번호 확인", { exact: true })
      .fill("sample-password");
    await page.getByRole("button", { name: "비밀번호 설정하고 시작" }).click();
    await expect(page.locator(".art-card")).toHaveCount(12);
    await expect(async () => {
      const loaded = await page
        .locator(".art-card img")
        .evaluateAll((images) => {
          images.forEach((image) => (image.loading = "eager"));
          return images.every(
            (image) => image.complete && image.naturalWidth > 0,
          );
        });
      expect(loaded).toBe(true);
    }).toPass();
    if (entry.startsWith("file:")) {
      await expect(page.locator(".art-card img").first()).toHaveAttribute(
        "src",
        /^data:image\/webp;base64,/,
      );
    } else {
      await expect(page.locator(".art-card img").first()).toHaveAttribute(
        "src",
        new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}art/`),
      );
    }
    await page.getByRole("button", { name: "학생 참여 QR" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".link-box")).toHaveText(
      `${entry}#/submit/demo-dongbaek-submit`,
    );
    await dialog.getByRole("link", { name: "학생 화면 열기" }).click();
    await expect(page).toHaveURL(`${entry}#/submit/demo-dongbaek-submit`);
    await expect(page.locator("main h1")).toBeVisible();
    await page.reload();
    await expect(page.locator("main h1")).toBeVisible();
    await page.goto(`${entry}#/teacher/activity/demo-dongbaek/finalize`);
    await page.locator("[name=character_image_id]").first().check();
    await page.locator("[name=scene_image_id]").first().check();
    await page
      .getByLabel("포스터 줄거리", { exact: true })
      .fill("소년과 점순이는 서툰 표현으로 서로의 마음을 알아 갑니다.");
    await page
      .getByLabel("시간적 배경 정리", { exact: true })
      .fill("봄꽃이 피는 계절");
    await page
      .getByLabel("공간적 배경 정리", { exact: true })
      .fill("농촌 마을과 산기슭");
    await page
      .getByLabel("전시작 제작자 이름 · 서명", { exact: true })
      .fill("우리 문학반");
    await page
      .getByRole("button", { name: "수업 완료 · 전시하기", exact: true })
      .click();
    await page
      .getByRole("button", { name: "최종 완료하고 전시", exact: true })
      .click();
    await expect(page).toHaveURL(`${entry}#/exhibition/demo-dongbaek`);
    await expect(page.locator(".literary-poster img")).toHaveCount(2);
    await page
      .locator(".literary-poster img")
      .evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode())));
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "포스터 HTML 저장" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("포스터.html");
    const pdf = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
    });
    expect(
      (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length,
    ).toBe(1);
    await page.goto(`${entry}#/exhibition`);
    await expect(page.locator(".exhibit-card")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
