import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTags,
  tagStatistics,
  filterImages,
  createPrompt,
  createScenePrompt,
  validScene,
  submissionProgress,
  validateStep,
} from "../src/utils/domain.js";
import {
  activitySchema,
  worksheetSchema,
  validImageSignature,
  aliasSchema,
} from "../netlify/lib/validation.js";
import { seedData } from "../src/services/seed.js";
import handler from "../netlify/functions/api.js";
test("tags are normalized, deduplicated, length bounded, and reject markup", () => {
  assert.deepEqual(
    normalizeTags([
      " #용감함 ",
      "#용감함",
      "",
      "#책임감",
      "<script>",
      "a".repeat(21),
      "#다정함",
    ]),
    ["용감함", "책임감", "다정함"],
  );
});
test("statistics count each student once and derive only observed co-occurrences", () => {
  const worksheets = [{ id: "a" }, { id: "b" }];
  const images = [
    { worksheet_id: "a", hashtags: ["소심함", "책임감"] },
    { worksheet_id: "a", hashtags: ["소심함", "내성적임"] },
    { worksheet_id: "b", hashtags: ["책임감", "용감함"] },
  ];
  const stats = tagStatistics(images, worksheets, { 내성적임: "소심함" });
  assert.equal(stats.total, 2);
  assert.equal(stats.tags.find((t) => t.tag === "소심함").count, 1);
  assert.equal(stats.tags.find((t) => t.tag === "책임감").percent, 100);
  assert.equal(stats.pairs.length, 2);
  assert.ok(
    !stats.pairs.some(
      (p) => p.tags.includes("소심함") && p.tags.includes("용감함"),
    ),
  );
});
test("filters combine character, multiple tags, approval, type and text", () => {
  const d = seedData();
  const result = filterImages(d.images, d.worksheets, {
    character: "점순이",
    tags: ["적극적임", "다정함"],
    approval: "approved",
    type: "character",
    query: "손끝",
  });
  assert.equal(result.length, 3);
  assert.equal(
    filterImages(d.images, d.worksheets, {
      type: "scene",
      query: "점순이가 나에게 감자를 건네는 사건",
    }).length,
    8,
  );
  assert.equal(
    filterImages(d.images, d.worksheets, {
      character: "나",
      tags: ["적극적임"],
    }).length,
    0,
  );
});
test("prompt preserves the distinction between source evidence and imagination", () => {
  const d = seedData();
  const prompt = createPrompt(d.activities[0], d.worksheets[0]);
  assert.match(prompt, /작품에 명시된 외모/);
  assert.match(prompt, /상상한 모습/);
  assert.match(prompt, /확정적인 사실로 취급하지/);
  assert.match(prompt, /작품 속 근거/);
});
test("student evidence and interpretation cannot be skipped", () => {
  assert.equal(
    Boolean(
      validateStep(2, {
        personality_tags: ["용감함"],
        personality_description: "단어",
      }),
    ),
    false,
  );
  assert.equal(
    Boolean(
      validateStep(3, {
        textual_evidence: "느낌",
        evidence_explanation: "좋음",
      }),
    ),
    false,
  );
  const d = seedData();
  assert.ok(validateStep(3, d.worksheets[0]));
  assert.ok(worksheetSchema.safeParse(d.worksheets[0]).success);
});
test("both prompts use teacher background summaries and completion requires both picture types", () => {
  const data = seedData();
  const activity = {
    ...data.activities[0],
    temporal_background: "봄철, 농사일이 시작되는 시기",
    spatial_background: "산기슭과 밭이 있는 농촌 마을",
  };
  const worksheet = data.worksheets[0];
  const scenePrompt = createScenePrompt(activity, worksheet);
  for (const prompt of [createPrompt(activity, worksheet), scenePrompt]) {
    assert.ok(prompt.includes(activity.temporal_background));
    assert.ok(prompt.includes(activity.spatial_background));
  }
  assert.ok(scenePrompt.includes(worksheet.scene.name));
  assert.ok(scenePrompt.includes(worksheet.scene.reason));
  assert.ok(validScene(worksheet.scene));
  assert.equal(Boolean(validScene({ ...worksheet.scene, reason: "" })), false);
  const portrait = { worksheet_id: worksheet.id, image_type: "character" };
  const scene = { worksheet_id: worksheet.id, image_type: "scene" };
  assert.equal(
    submissionProgress([portrait, portrait], worksheet.id).complete,
    false,
  );
  assert.equal(
    submissionProgress([portrait, scene], worksheet.id).complete,
    true,
  );
});
test("server validates activity settings, strips privileged fields, rejects alias cycles", () => {
  const activity = seedData().activities[0];
  const valid = activitySchema.parse({
    ...activity,
    teacher_id: "attacker",
    stage: "CLOSED",
  });
  assert.equal(valid.teacher_id, undefined);
  assert.equal(valid.stage, undefined);
  assert.equal(
    activitySchema.safeParse({
      ...activity,
      settings: { ...activity.settings, max_images: 99 },
    }).success,
    false,
  );
  assert.equal(
    aliasSchema.safeParse({ 소심함: "내성적임", 내성적임: "소심함" }).success,
    false,
  );
});
test("image signatures reject renamed HTML and SVG content", () => {
  assert.equal(
    validImageSignature(new TextEncoder().encode("<svg>"), "image/png"),
    false,
  );
  assert.equal(
    validImageSignature(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      "image/png",
    ),
    true,
  );
  assert.equal(
    validImageSignature(new TextEncoder().encode("RIFFxxxxWEBP"), "image/webp"),
    true,
  );
});
test("API rejects unsupported method, foreign origin, malformed body before any database access", async () => {
  let response = await handler(
    new Request("https://litverse.test/api/teacher/list"),
  );
  assert.equal(response.status, 405);
  response = await handler(
    new Request("https://litverse.test/api/teacher/list", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.test",
      },
      body: "{}",
    }),
  );
  assert.equal(response.status, 403);
  response = await handler(
    new Request("https://litverse.test/api/teacher/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    }),
  );
  assert.equal(response.status, 400);
});
