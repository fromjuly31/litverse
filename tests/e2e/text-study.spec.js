import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const log = { spoken: [], cancels: 0, pauses: 0, resumes: 0 };
    let current;
    const voices = [
      { name: "한국어 목소리 하나", voiceURI: "test-ko-1", lang: "ko-KR" },
      { name: "한국어 목소리 둘", voiceURI: "test-ko-2", lang: "ko-KR" },
      { name: "English voice", voiceURI: "test-en", lang: "en-US" },
    ];
    const synth = new EventTarget();
    synth.getVoices = () => voices;
    synth.speak = (utterance) => {
      current = utterance;
      log.spoken.push({
        text: utterance.text,
        voice: utterance.voice?.voiceURI,
        rate: utterance.rate,
        pitch: utterance.pitch,
      });
      queueMicrotask(() => utterance.onstart?.());
    };
    synth.cancel = () => {
      log.cancels++;
    };
    synth.pause = () => {
      log.pauses++;
    };
    synth.resume = () => {
      log.resumes++;
    };
    class Utterance {
      constructor(text) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "speechSynthesis", {
      value: synth,
      configurable: true,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: Utterance,
      configurable: true,
    });
    window.__speechLog = log;
    window.__finishSpeech = () => current?.onend?.();
  });
});

test("PDF regions become editable, saved paragraphs with navigation and selectable narration voices", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/teacher/activities/new");
  await page.getByLabel("작품 제목").fill("함께 읽는 이야기");
  await page.getByLabel("작가", { exact: true }).fill("테스트 작가");
  await page
    .getByLabel("수업 소개", { exact: true })
    .fill("본문을 문단 단위로 함께 읽습니다.");
  await page.getByRole("tab", { name: "2단계 작품 줄거리" }).click();
  await page.locator("#enable-text-study").check();
  await page.getByRole("button", { name: "다음 단계", exact: true }).click();
  await expect(page.locator("#editor-error")).toContainText("문단을 하나 이상");
  await page
    .locator("#lesson-pdf")
    .setInputFiles("tests/fixtures/text-study.pdf");
  await expect(page.locator("#pdf-page-number")).toHaveText("1 / 2 페이지");
  await page.getByRole("button", { name: /본문 선택: 봄바람이/ }).click();
  await page.getByRole("button", { name: /본문 선택: 그는 인물의/ }).click();
  await expect(page.locator("#paragraph-count")).toHaveText("2");
  await expect(page.getByLabel("본문 문단 1", { exact: true })).toHaveValue(
    /작은 마을의 이야기/,
  );
  await page
    .getByLabel("본문 문단 1", { exact: true })
    .fill("첫 번째 문단입니다.\n다음 문장도 함께 읽습니다.");
  await page
    .getByRole("button", { name: "문단 1 나누기", exact: true })
    .click();
  await expect(page.locator("#paragraph-count")).toHaveText("3");
  await page
    .getByRole("button", { name: "문단 1 다음 문단과 합치기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "문단 1 아래로", exact: true })
    .click();
  await expect(page.getByLabel("본문 문단 1", { exact: true })).toHaveValue(
    /그는 인물의/,
  );
  await page
    .getByRole("button", { name: "다음 PDF 페이지", exact: true })
    .click();
  await page.getByRole("button", { name: /본문 선택: 서로의 생각을/ }).click();
  await expect(page.locator("#paragraph-count")).toHaveText("3");
  await page.getByRole("tab", { name: "3단계 질문 목록" }).click();
  await page
    .getByLabel("질문 1", { exact: true })
    .fill("사진에 담은 해석은 무엇인가요?");
  await page.getByRole("tab", { name: "4단계 확인과 시작" }).click();
  await expect(page.locator("#lesson-review")).toContainText(
    "text-study.pdf · 3문단",
  );
  await page.getByLabel("수업 비밀번호", { exact: true }).fill("1234");
  await page.getByLabel("비밀번호 확인", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "수업 만들기", exact: true }).click();
  await expect(page).toHaveURL(/\/background$/);
  const activityUrl = page.url().replace(/\/background$/, "");
  const tabs = page.getByRole("navigation", { name: "수업 활동", exact: true });
  await expect(tabs.getByRole("link")).toHaveCount(4);
  expect(await tabs.getByRole("link").allTextContents()).toEqual(
    expect.arrayContaining([
      expect.stringContaining("배경 탐구"),
      expect.stringContaining("본문 학습"),
      expect.stringContaining("등장인물 갤러리"),
      expect.stringContaining("사건 분석"),
    ]),
  );
  await tabs.getByRole("link", { name: /본문 학습/ }).click();
  await expect(page.locator("#reading-text")).toContainText("그는 인물의");
  await page
    .getByRole("combobox", { name: "낭독 목소리", exact: true })
    .click();
  await page
    .getByRole("option", { name: "한국어 목소리 둘 · ko-KR", exact: true })
    .click();
  await page.getByRole("combobox", { name: "낭독 속도", exact: true }).click();
  await page
    .getByRole("option", { name: "조금 천천히 · 0.85배", exact: true })
    .click();
  await page.locator("#narration-play").click();
  expect(
    await page.evaluate(() => window.__speechLog.spoken.at(-1)),
  ).toMatchObject({ voice: "test-ko-2", rate: 0.85 });
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  expect(await page.evaluate(() => window.__speechLog.pauses)).toBe(1);
  await page.getByRole("button", { name: "이어서 낭독", exact: true }).click();
  await page
    .getByRole("button", { name: "다음 본문 문단", exact: true })
    .click();
  await expect(page.locator("#reading-text")).toContainText("첫 번째 문단");
  await expect(page.locator("#narration-play")).toHaveText(/낭독 시작/);
  await page.reload();
  await expect(page.locator("#reading-position")).toHaveText("2 / 3 문단");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390 || width === 1440) {
      await mkdir("test-results/text-study", { recursive: true });
      await page.screenshot({
        path: `test-results/text-study/reader-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.goto(activityUrl + "/edit");
  await page.getByRole("tab", { name: "2단계 작품 줄거리" }).click();
  await expect(page.locator("#paragraph-count")).toHaveText("3");
  await page
    .getByRole("button", { name: "첨부된 PDF 열기", exact: true })
    .click();
  await expect(page.locator("#pdf-page-number")).toHaveText("1 / 2 페이지");
  expect(errors).toEqual([]);
});

test("scanned Korean PDF is recognized locally and its text can be selected", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/teacher/activities/new");
  await page.getByRole("tab", { name: "2단계 작품 줄거리" }).click();
  await page.locator("#enable-text-study").check();
  await page
    .locator("#lesson-pdf")
    .setInputFiles("tests/fixtures/text-study-scan.pdf");
  await expect(page.locator("#pdf-status")).toContainText("스캔 이미지");
  await page
    .getByRole("button", { name: "현재 페이지 문자 인식", exact: true })
    .click();
  await expect(page.locator("#pdf-status")).toContainText(
    "문자 인식으로 본문 영역",
    { timeout: 90000 },
  );
  const blocks = page.locator(".pdf-block");
  expect(await blocks.count()).toBeGreaterThan(1);
  const recognized = (await blocks.allTextContents()).join(" ");
  expect(recognized).toMatch(/소녀|책을|바람/);
  await blocks.nth(1).click();
  await expect(page.locator("#paragraph-count")).toHaveText("1");
  expect(
    (await page.getByLabel("본문 문단 1", { exact: true }).inputValue()).length,
  ).toBeGreaterThan(10);
  await mkdir("test-results/text-study", { recursive: true });
  await page.screenshot({
    path: "test-results/text-study/scan-preview.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
