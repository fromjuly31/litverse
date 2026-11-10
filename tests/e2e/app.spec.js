import { test, expect } from "./fixtures.js";
import { mkdir } from "node:fs/promises";
const route = "/teacher/activity/demo-dongbaek";
async function choose(page, label, option) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
}
test("desktop dashboard, custom QR dialog, focus return and gallery filters", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", () => {
    throw new Error("Native dialog opened");
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/teacher");
  await expect(
    page.getByRole("heading", { name: "우리의 문학 수업" }),
  ).toBeVisible();
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({
    path: "test-results/screenshots/teacher-desktop.png",
    fullPage: true,
  });
  await expect(page.locator(".lesson-tabs")).toHaveCount(0);
  await page.getByRole("link", { name: "동백꽃 수업 열기" }).click();
  await page
    .getByRole("navigation", { name: "수업 활동", exact: true })
    .getByRole("link", { name: "등장인물 갤러리" })
    .click();
  await page.getByRole("button", { name: "학생 참여 QR" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("img", { name: "이미지 제출 접속 QR 코드" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "학생 참여 QR" }),
  ).toBeFocused();
  await expect(page.getByRole("link", { name: "인물 해석 비교" })).toBeHidden();
  await page.locator(".gallery-options summary").focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "크게 보기", exact: true }).click();
  await expect(page.locator("#gallery-grid")).toHaveClass(/focus/);
  await page.getByRole("button", { name: "그리드 보기", exact: true }).click();
  await page.locator(".gallery-options summary").click();
  await page.goto(`${route}/gallery`);
  await page.locator(".gallery-options summary").click();
  await choose(page, "등장인물", "점순이");
  await expect(page.locator(".art-card")).toHaveCount(6);
  await choose(page, "승인 상태", "승인 대기");
  await expect(page.locator(".gallery-options summary")).toContainText(
    "2개 적용",
  );
  await expect(page.locator(".art-card")).toHaveCount(1);
  await page.getByRole("combobox", { name: "작품 정렬" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "작품 정렬" })).toContainText(
    "태그 빈도순",
  );
  expect(await page.locator("select").count()).toBe(0);
  await noOverflow(page);
  expect(errors).toEqual([]);
});
test("mobile student completes both prompt activities and submits two independent images", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/activity/demo-dongbaek-analysis");
  await page
    .getByRole("button", { name: "나의 해석 시작하기", exact: true })
    .click();
  await page.getByLabel("학생 번호 또는 별칭").fill("모바일 테스트");
  await page
    .getByRole("button", { name: "나의 해석 시작하기", exact: true })
    .click();
  await page.getByLabel("등장인물 이름").fill("점순이");
  await page
    .getByLabel("이 인물을 선택한 이유")
    .fill("같은 행동이 다르게 해석될 수 있어 더 깊이 이해하고 싶어요.");
  await page.getByRole("button", { name: "#용감함", exact: true }).click();
  await page.getByRole("button", { name: "#다정함", exact: true }).click();
  await page
    .getByLabel("인물의 성격에 대한 나의 생각")
    .fill(
      "겉으로는 짓궂게 행동하지만 관심을 표현하려는 마음과 먼저 다가가는 용기가 있는 인물이라고 생각해요.",
    );
  await page
    .getByLabel("왜 그렇게 생각했나요? 본문 속 근거")
    .fill(
      "점순이는 일을 하던 나에게 감자를 건네지만 나는 이유를 모른 채 그 감자를 거절한다.",
    );
  await page
    .getByLabel("근거와 성격을 연결한 이유")
    .fill(
      "먼저 먹을 것을 나누려는 행동은 상대에게 관심을 표현하는 다정한 용기라고 볼 수 있다.",
    );
  await page
    .getByLabel("성격이 드러나도록 상상한 인물의 모습")
    .fill(
      "소박한 옷차림에 망설이면서도 상대를 똑바로 바라보는 눈빛, 따뜻한 봄날의 표정으로 표현하고 싶어요.",
    );
  await choose(page, "인물 사진 스타일", "수채화");
  await noOverflow(page);
  await page.reload();
  await page.getByRole("button", { name: "작성하던 해석 이어가기" }).click();
  await expect(page.getByLabel("인물의 성격에 대한 나의 생각")).toHaveValue(
    /겉으로는/,
  );
  await page.getByRole("button", { name: "다음: 사건과 이유" }).click();
  for (const [label, value] of [
    [
      "가장 인상 깊은 사건",
      "점순이가 나에게 감자를 건네는 사건이 기억에 남는다.",
    ],
    [
      "이 사건이 인상 깊었던 이유",
      "관심을 표현하려는 마음을 알아차리지 못하는 서투름이 인상 깊었다.",
    ],
    [
      "본문에 나타난 사건의 전개",
      "점순이가 나에게 감자를 건네지만 나는 관심의 표현임을 모르고 거절한다.",
    ],
    [
      "사건 속 인물의 행동",
      "점순이가 감자를 내밀고 나는 고개를 돌리며 그 감자를 거절한다.",
    ],
    [
      "사진으로 표현할 장면의 구체적인 모습",
      "봄날의 밭가에서 감자를 든 손과 고개를 돌린 인물을 함께 담아 마음의 거리를 보여 준다.",
    ],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.screenshot({
    path: "test-results/screenshots/student-scene-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "두 프롬프트 완성" }).click();
  await expect(
    page.getByRole("heading", {
      name: "인물의 마음, 사건의 순간. 두 장의 작품으로 표현해요.",
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /인상 깊은 사건/ }).click();
  await expect(page.locator(".prompt-card")).toContainText(
    "관심을 표현하려는 마음",
  );
  await expect(page.locator(".prompt-card")).toContainText("시간적 배경");
  await page.getByRole("link", { name: "두 사진 제출하기" }).click();
  await page.getByRole("button", { name: "나의 두 분석 불러오기" }).click();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 120;
    c.height = 160;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#789bff";
    ctx.fillRect(0, 0, 120, 160);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("인물 이미지 파일 선택").setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.getByAltText("제출할 이미지 미리보기")).toBeVisible();
  await page
    .getByLabel("인물 사진에서 강조한 특징")
    .fill("먼저 다가가는 인물의 다정한 용기를 눈빛에 담았어요.");
  await page.getByRole("button", { name: "인물 사진 제출하기" }).click();
  await expect(
    page.getByRole("heading", {
      name: "인물 사진을 제출했어요. 이제 사건 장면을 이어가요.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /두 장의 작품이/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "다음: 사건 장면 사진 제출" }).click();
  await page.getByLabel("사건 장면 이미지 파일 선택").setInputFiles({
    name: "scene.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.getByAltText("제출할 이미지 미리보기")).toBeVisible();
  await page
    .getByLabel("사건 장면 사진에서 강조한 특징")
    .fill("감자를 건네는 손과 외면하는 시선 사이의 거리를 강조했어요.");
  await page.getByRole("button", { name: "사건 장면 사진 제출하기" }).click();
  await expect(
    page.getByRole("heading", {
      name: "두 장의 작품이 우리의 이야기에 더해졌어요.",
    }),
  ).toBeVisible();
  await noOverflow(page);
  expect(errors).toEqual([]);
  await page.goto(route + "/gallery");
  await page
    .getByRole("searchbox", { name: "작품 검색" })
    .fill("모바일 테스트");
  await expect(page.locator(".art-card")).toHaveCount(1);
  await page
    .locator(".lesson-tabs")
    .getByRole("link", { name: "사건 분석" })
    .click();
  await page
    .getByRole("searchbox", { name: "작품 검색" })
    .fill("모바일 테스트");
  await expect(page.locator(".art-card")).toHaveCount(1);
  await page.locator("[data-select-image]").check();
  await page.getByRole("button", { name: "전시 승인", exact: true }).click();
  await expect(page.locator(".art-card .badge")).toHaveText("전시 중");
});
test("activity creation, stage change, comparison, deletion and tag mapping use custom controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/teacher/activities/new");
  await page.getByLabel("작품 제목").fill("테스트 소설");
  await page.getByLabel("작가", { exact: true }).fill("테스트 작가");
  await page
    .getByLabel("수업 소개", { exact: true })
    .fill("서로 다른 해석을 근거를 통해 나눠 보아요.");
  await choose(page, "기본 이미지 스타일", "연필 드로잉");
  await page.getByRole("tab", { name: "4단계 확인과 시작" }).click();
  await page
    .getByLabel("수업 비밀번호", { exact: true })
    .fill("lesson-test-password");
  await page
    .getByLabel("비밀번호 확인", { exact: true })
    .fill("lesson-test-password");
  await page.getByRole("button", { name: "수업 만들기", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "배경 탐구",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "수업 설정", exact: true }).click();
  await choose(page, "활동 진행 단계", "인물·사건 분석 중");
  await page.getByRole("button", { name: "단계 변경", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "단계 변경", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "인물·사건 분석 중" }),
  ).toBeVisible();
  await page.goto(`${route}/gallery`);
  await page.locator("[data-select-image]").nth(0).check();
  await page.locator("[data-select-image]").nth(1).check();
  await page.getByRole("button", { name: "해석 비교" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "같은 인물, 서로 다른 해석" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "이미지 2개를 삭제할까요?",
  );
  await page.getByRole("button", { name: "2개 삭제", exact: true }).click();
  await expect(page.locator(".art-card")).toHaveCount(10);
  await page.goto(`${route}/analytics`);
  await page.getByRole("button", { name: "태그 묶기" }).click();
  await page.getByLabel("원본 태그 1").fill("적극적임");
  await page.getByLabel("대표 태그 1").fill("용감함");
  await page.getByRole("button", { name: "태그 매핑 저장" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#ranking")).toContainText("용감함");
});
test("responsive layout at phone, tablet, laptop and projector sizes", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of [
      "/teacher",
      `${route}/background`,
      `${route}/gallery`,
      `${route}/scenes`,
      `${route}/analytics`,
      "/activity/demo-dongbaek-analysis",
      "/submit/demo-dongbaek-submit",
    ]) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      await noOverflow(page);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${route}/gallery`);
  await page.locator(".gallery-options summary").click();
  await page.getByRole("combobox", { name: "승인 상태" }).click();
  const box = await page
    .getByRole("listbox", { name: "승인 상태" })
    .boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "test-results/screenshots/gallery-mobile.png",
    fullPage: true,
  });
});
test("custom modals trap focus, honor Escape and fit a 320px phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`${route}/gallery`);
  await page.locator("[data-open-art]").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await noOverflow(page);
  expect(await page.locator("#app").evaluate((el) => el.inert)).toBe(true);
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement.closest("[role=dialog]")),
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "test-results/screenshots/detail-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.locator("#app").evaluate((el) => el.inert)).toBe(false);
  await expect(page.locator("[data-open-art]").first()).toBeFocused();
});
test("exhibition uses approved work, reduced motion, tag filtering and controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${route}/showcase`);
  await expect(page.locator(".showcase-piece")).toHaveCount(15);
  await expect(page.getByRole("button", { name: "이어 보기" })).toBeVisible();
  await choose(page, "전시 성격 태그", "#다정함");
  await expect(page.locator(".showcase-piece.emphasized")).toHaveCount(5);
  await page.getByRole("button", { name: "다음 작품" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await noOverflow(page);
  await page.screenshot({
    path: "test-results/screenshots/projector.png",
    fullPage: true,
  });
});
