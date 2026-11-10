import { test, expect } from "./fixtures.js";

test("photo submission saves the teacher's questions and each student's answers with the image", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const lesson = await page.evaluate(async () => {
    const { request } = await import("/src/services/api.js");
    const data = await request("teacher/get", { id: "demo-dongbaek" });
    const questions = [
      "내가 파악한 인물의 특징은?",
      "사진에 어떻게 표현했나요?",
      "작품의 어떤 내용을 근거로 삼았나요?",
    ];
    await request("teacher/save", {
      id: data.activity.id,
      activity: {
        ...data.activity,
        settings: {
          ...data.activity.settings,
          submission_questions: questions,
        },
      },
    });
    const links = await request("teacher/links", { id: data.activity.id });
    return {
      id: data.activity.id,
      token: links.submission_token,
      code: data.worksheets[0].submission_code,
      worksheet: data.worksheets[0].id,
      questions,
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/submit/${lesson.token}`);
  await page.getByLabel("개인 제출 코드", { exact: true }).fill(lesson.code);
  await page.getByRole("button", { name: "나의 두 분석 불러오기" }).click();
  const responses = [
    "인물은 겉으로는 무뚝뚝하지만 상대를 세심하게 살피는 특징이 있습니다. "
      .repeat(8)
      .trim(),
    "표정과 손짓에 인물의 서툰 마음을 담았습니다.",
    "감자를 건네는 장면을 근거로 삼았습니다.",
  ];
  await expect(page.locator("#upload-tags")).toHaveCount(0);
  await expect(
    page.getByLabel("인물 사진에서 강조한 특징", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#upload-form textarea")).toHaveCount(3);
  await expect(page.locator("#submit-image")).toBeDisabled();
  for (let i = 0; i < 3; i++)
    await page
      .getByLabel(`${i + 1}. ${lesson.questions[i]}`, { exact: true })
      .fill(responses[i]);
  await page.reload();
  await page.getByRole("button", { name: "나의 두 분석 불러오기" }).click();
  await expect(
    page.getByLabel(`1. ${lesson.questions[0]}`, { exact: true }),
  ).toHaveValue(responses[0]);
  await page.getByRole("tab", { name: /인상 깊은 사건/ }).click();
  await expect(
    page.getByLabel(`1. ${lesson.questions[0]}`, { exact: true }),
  ).toHaveValue("");
  await page
    .getByLabel(`1. ${lesson.questions[0]}`, { exact: true })
    .fill("사건 사진에서 드러난 다른 해석");
  await page.getByRole("tab", { name: /인물의 성격/ }).click();
  await expect(
    page.getByLabel(`1. ${lesson.questions[0]}`, { exact: true }),
  ).toHaveValue(responses[0]);
  await page
    .locator("#image-file")
    .setInputFiles("public/art/literary-landscape.webp");
  await expect(page.locator(".upload-preview")).toBeVisible();
  await expect(
    page.getByLabel(`2. ${lesson.questions[1]}`, { exact: true }),
  ).toHaveValue(responses[1]);
  await expect(page.locator("#submit-image")).toBeEnabled();
  await page.locator("#submit-image").click();
  await expect(page.locator(".submission-responses")).toContainText(
    responses[0],
  );
  const image = await page.evaluate(async ({ id, worksheet }) => {
    const { request } = await import("/src/services/api.js");
    const data = await request("teacher/get", { id });
    return data.images.find(
      (image) =>
        image.worksheet_id === worksheet && image.image_type === "character",
    );
  }, lesson);
  expect(image.question_responses).toEqual(
    lesson.questions.map((question, index) => ({
      question,
      answer: responses[index],
    })),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/teacher/activity/${lesson.id}/gallery`);
  await page.locator(`[data-art-id="${image.id}"] .art-hit`).click();
  await expect(
    page.getByRole("dialog").locator(".submission-responses"),
  ).toContainText(responses[2]);
  expect(errors).toEqual([]);
});
