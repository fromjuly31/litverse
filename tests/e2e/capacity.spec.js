import { test, expect } from "./fixtures.js";
test("projector renders all 60 approved character and scene pictures without distortion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/teacher");
  const id = await page.evaluate(async () => {
    const { request: demoRequest } = await import("/src/services/api.js");
    const { seedData } = await import("/src/services/seed.js");
    const fixtures = seedData();
    const activity = await demoRequest("teacher/save", {
      password: "lesson-test-password",
      activity: {
        ...fixtures.activities[0],
        title: "30명의 시선",
        settings: {
          allow_resubmit: true,
          require_approval: false,
          enable_scene: true,
          max_images: 1,
        },
      },
    });
    await demoRequest("teacher/stage", {
      id: activity.id,
      stage: "SUBMISSION",
    });
    await Promise.all(
      Array.from({ length: 30 }, async (_, i) => {
        const { worksheet, code } = await demoRequest("student/complete", {
          token: activity.worksheet_token,
          code: crypto.randomUUID().replaceAll("-", "") + "0123456789abcdef",
          worksheet: {
            ...fixtures.worksheets[i % 4],
            student_label: `학생 ${i + 1}`,
          },
        });
        for (const type of ["character", "scene"])
          await demoRequest("student/upload", {
            token: activity.submission_token,
            code,
            image_type: type,
            slot: 0,
            image_url:
              type === "character"
                ? `/art/portrait-${(i % 4) + 1}.svg`
                : `/art/scene-${(i % 2) + 1}.svg`,
            hashtags: worksheet.personality_tags,
            one_line_description: "문학 해석과 본문 근거를 담은 작품",
          });
      }),
    );
    return activity.id;
  });
  await page.goto(`/teacher/activity/${id}/showcase`);
  await expect(page.locator(".showcase-piece")).toHaveCount(60);
  await expect(page.getByRole("button", { name: "이어 보기" })).toBeVisible();
  const geometry = await page
    .locator(".showcase-piece img")
    .evaluateAll((images) =>
      images.every((img) => {
        const r = img.getBoundingClientRect();
        return (
          img.complete &&
          img.naturalWidth > 0 &&
          r.width > 20 &&
          r.height > 20 &&
          getComputedStyle(img).objectFit === "contain" &&
          r.top >= 0 &&
          r.bottom <= innerHeight
        );
      }),
    );
  expect(geometry).toBe(true);
  await page.screenshot({
    path: "test-results/screenshots/projector-60-artworks.png",
  });
});
