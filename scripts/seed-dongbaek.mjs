import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { dongbaekSamples } from "./fixtures/dongbaek-samples.mjs";
import {
  DEFAULT_TAGS,
  DEFAULT_TASKS,
  createPrompt,
  createScenePrompt,
} from "../src/utils/domain.js";
import { synopsisExamples } from "../src/utils/archive.js";
import {
  activitySchema,
  worksheetSchema,
  validImageSignature,
} from "../netlify/lib/validation.js";
import {
  activityTokens,
  createServer,
  hmac,
  newCode,
} from "../netlify/lib/server.js";
import { hashPassword } from "../netlify/lib/lesson-access.js";

const project = "https://undfovtwlmlzbmjyjqfa.supabase.co";
const site = "https://litverse-fromjuly31.netlify.app";
const passwordFile = new URL("../.env.dongbaek-demo", import.meta.url);
const activityId = sampleId("lesson");

const temporal =
  "감자가 든 손, 농사일, 산기슭의 노란 동백꽃을 살피면 봄이라는 계절을 알 수 있습니다. 땅을 빌려 농사짓는 관계는 작품이 쓰인 1930년대 농촌 사회를 이해하는 단서입니다.";
const spatial =
  "밭과 마당, 나무하러 오가는 산기슭이 주요 공간입니다. 두 집이 가까워 자주 부딪치지만 농사를 짓는 땅을 둘러싼 집안 관계 때문에 마음대로 항의하기는 어렵습니다.";
const activity = activitySchema.parse({
  title: "동백꽃",
  author: "김유정",
  synopsis: synopsisExamples["동백꽃|김유정"],
  course_name: "동백꽃 읽기 · 예시 자료",
  class_name: "예시 학급 · 25명",
  introduction:
    "가상 학생 25명의 수업 예시입니다. 감자, 닭싸움, 노란 동백꽃 장면을 고른 학생들의 서로 다른 해석과 그림을 비교해 보세요.",
  objectives:
    "인물의 말과 행동을 근거로 성격을 해석하고, 사건을 표현한 그림을 서로 비교합니다.",
  background: "한국 농촌, 노란 동백꽃이 피는 봄",
  tasks: DEFAULT_TASKS,
  tags: DEFAULT_TAGS,
  expected_student_count: 25,
  default_image_style: "문학 일러스트레이션",
  settings: {
    allow_resubmit: true,
    require_approval: true,
    enable_scene: true,
    max_images: 1,
  },
});

const backgroundQuestions = [
  {
    kind: "temporal",
    prompt: "계절이나 시대를 짐작하게 하는 본문 속 단서는 무엇인가요?",
    summary: temporal,
    answers: [
      "산기슭의 노란 동백꽃이 핀 부분에서 봄이라고 짐작했어요.",
      "밭에서 일하고 산에 나무를 하러 가니까 농사일이 시작되는 때 같아요.",
      "땅을 빌려 부치고 점순네 눈치를 본다는 부분이 지금과 다른 시대처럼 느껴졌어요.",
      "계절은 꽃이 알려 주고, 시대는 두 집이 땅을 빌리고 빌려 주는 관계가 알려 준다고 봤어요.",
      "동백꽃이라는 이름만 보고 겨울인 줄 알았는데 노란 꽃이 핀 산과 밭일을 같이 보니 봄 같아요.",
      "정확한 날짜는 없어도 꽃이 한꺼번에 피어 있다는 말로 계절을 알 수 있었어요.",
    ],
  },
  {
    kind: "spatial",
    prompt:
      "밭가, 마당, 산기슭 중 기억에 남는 곳은 어디인가요? 그곳에서 무슨 일이 있었나요?",
    summary: spatial,
    answers: [
      "밭가요. 일하고 있는 나에게 점순이가 감자를 갖고 온 곳이에요.",
      "산기슭에서 둘이 꽃 속에 쓰러지는 장면이 가장 밝게 상상됐어요.",
      "마당에 닭 두 마리를 놓으니까 두 집이 가까이 산다는 느낌이 들었어요.",
      "나무하고 내려오는 길이 기억나요. 집으로 오는 길인데도 편하지 않았을 것 같아요.",
      "밭은 마음이 엇갈린 곳이고 꽃이 핀 곳은 분위기가 풀린 곳 같아요.",
      "두 집이 서로 오가기 쉬운 농촌 마을인데, 땅을 빌리는 쪽은 하고 싶은 말을 다 못 하는 곳이기도 해요.",
    ],
  },
];

function sampleId(key) {
  const sha = createHash("sha256")
    .update(`litverse/dongbaek/v1/${key}`)
    .digest("hex");
  return `${sha.slice(0, 8)}-${sha.slice(8, 12)}-4${sha.slice(13, 16)}-8${sha.slice(17, 20)}-${sha.slice(20, 32)}`;
}

function checked(result, label) {
  if (result.error) {
    throw new Error(
      `${label}: ${result.error.code || result.error.statusCode || result.status} ${result.error.message}`,
    );
  }
  return result.data;
}

function sampleRows(anchoredAt) {
  const interpretedWork = {
    ...activity,
    temporal_background: temporal,
    spatial_background: spatial,
  };
  const learners = dongbaekSamples.map((sample, index) => {
    const {
      portraitImage,
      portraitCaption,
      sceneImage,
      sceneTags,
      ...reading
    } = sample;
    const number = index + 1;
    const input = worksheetSchema.parse({
      ...reading,
      student_label: `${String(number).padStart(2, "0")}번`,
      canonical_appearance: "",
      background: activity.background,
    });
    const id = sampleId(`worksheet/${number}`);
    const completedAt = new Date(
      anchoredAt - (180 - index * 4) * 60_000,
    ).toISOString();
    const worksheet = {
      ...input,
      id,
      activity_id: activityId,
      generated_prompt: createPrompt(interpretedWork, input),
      scene_prompt: createScenePrompt(interpretedWork, input),
      completed_at: completedAt,
      created_at: completedAt,
    };
    const images = [
      {
        type: "character",
        source: portraitImage,
        tags: input.personality_tags,
        caption: portraitCaption,
      },
      {
        type: "scene",
        source: sceneImage,
        tags: sceneTags,
        caption: input.scene.visual,
      },
    ].map(({ type, source, tags, caption }, offset) => {
      const imageId = sampleId(`image/${number}/${type}`);
      return {
        source,
        row: {
          id: imageId,
          activity_id: activityId,
          worksheet_id: id,
          image_type: type,
          image_path: `${activityId}/${id}/${type}/${imageId}.${source.split(".").at(-1)}`,
          hashtags: tags,
          one_line_description: caption,
          approval_status:
            (index + offset * 2) % 7 === 0 ? "pending" : "approved",
          created_at: new Date(
            anchoredAt - (75 - index * 2 - offset) * 60_000,
          ).toISOString(),
        },
      };
    });
    return { worksheet, images };
  });
  assert.equal(learners.length, 25);
  return learners;
}

async function readAssets(images) {
  const names = [...new Set(images.map(({ source }) => source))];
  return new Map(
    await Promise.all(
      names.map(async (name) => {
        const location = name.startsWith("dongbaek-")
          ? new URL(`./fixtures/dongbaek-art/${name}`, import.meta.url)
          : new URL(`../public/art/${name}`, import.meta.url);
        const bytes = await readFile(location);
        const mime = name.endsWith(".webp") ? "image/webp" : "image/jpeg";
        assert.ok(
          bytes.length <= 5 * 1024 * 1024 && validImageSignature(bytes, mime),
          name,
        );
        return [name, { bytes, mime }];
      }),
    ),
  );
}

async function localPassword() {
  const password = newCode().slice(0, 20);
  try {
    await writeFile(passwordFile, `DONGBAEK_DEMO_PASSWORD=${password}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    return password;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const stored = (await readFile(passwordFile, "utf8"))
      .trim()
      .match(/^DONGBAEK_DEMO_PASSWORD=([a-f\d]{20})$/);
    assert.ok(stored, "Invalid .env.dongbaek-demo");
    return stored[1];
  }
}

async function callSite(action, body, token) {
  const response = await fetch(`${site}/api/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { "X-Lesson-Token": token }),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  assert.ok(response.ok, `Live ${action}: HTTP ${response.status}`);
  return response.json();
}

async function verifyLive(password) {
  const lessons = await callSite("public/list", {});
  assert.deepEqual(
    lessons.map(({ id, title }) => ({ id, title })),
    [{ id: activityId, title: "동백꽃" }],
  );
  const { token } = await callSite("lesson/unlock", {
    id: activityId,
    password,
  });
  const data = await callSite("teacher/get", { id: activityId }, token);
  assert.equal(data.worksheets.length, 25);
  assert.equal(data.images.length, 50);
  for (const worksheet of data.worksheets) {
    assert.deepEqual(
      data.images
        .filter((row) => row.worksheet_id === worksheet.id)
        .map((row) => row.image_type)
        .sort(),
      ["character", "scene"],
    );
  }
  const imageUrls = new Set();
  for (const image of data.images) {
    assert.equal(new URL(image.image_url).origin, project);
    imageUrls.add(`${image.image_type}:${image.image_path.split(".").at(-1)}`);
  }
  for (const variant of imageUrls) {
    const sample = data.images.find(
      (image) =>
        `${image.image_type}:${image.image_path.split(".").at(-1)}` === variant,
    );
    const response = await fetch(sample.image_url, {
      method: "HEAD",
      signal: AbortSignal.timeout(15_000),
    });
    assert.ok(
      response.ok && response.headers.get("content-type")?.startsWith("image/"),
      `Stored photo unavailable: ${variant}`,
    );
  }
  console.log(
    `Verified live app: 1 lesson, 25 worksheets, 50 image submissions.\n${site}/teacher/activity/${activityId}/gallery`,
  );
}

async function publish(assets) {
  loadEnvFile(new URL("../.env", import.meta.url));
  assert.equal(new URL(process.env.SUPABASE_URL).origin, project);
  const db = createServer();
  const existing = checked(
    await db.from("activities").select("id,created_at,deletion_pending"),
    "Check existing lessons",
  );
  assert.ok(
    existing.every(({ id }) => id === activityId),
    "The project contains other lessons. No data changed.",
  );
  const password = await localPassword();
  if (existing.length && !existing[0].deletion_pending) {
    return verifyLive(password);
  }
  if (!existing.length) {
    const teacher = checked(
      await db
        .from("teacher_profiles")
        .select("id")
        .eq("is_admin", true)
        .order("created_at")
        .limit(1)
        .single(),
      "Find lesson owner",
    );
    const { tags, ...fields } = activity;
    const tokens = activityTokens({ id: activityId });
    checked(
      await db.from("activities").insert({
        ...fields,
        id: activityId,
        teacher_id: teacher.id,
        stage: "SUBMISSION",
        temporal_background: temporal,
        spatial_background: spatial,
        worksheet_token_hash: hmac(`qr:${tokens.worksheet_token}`),
        submission_token_hash: hmac(`qr:${tokens.submission_token}`),
        deletion_pending: true,
      }),
      "Prepare hidden lesson",
    );
  }

  const learners = sampleRows(
    existing.length ? Date.parse(existing[0].created_at) : Date.now(),
  );
  const images = learners.flatMap((learner) => learner.images);
  const report = await Promise.allSettled([
    hashPassword(password).then(async (passwordHash) =>
      checked(
        await db
          .from("lesson_access")
          .upsert({ activity_id: activityId, password_hash: passwordHash }),
        "Save lesson password",
      ),
    ),
    db
      .from("tag_catalog")
      .upsert(
        activity.tags.map((tag) => ({
          activity_id: activityId,
          tag_name: tag,
        })),
        {
          onConflict: "activity_id,tag_name",
          ignoreDuplicates: true,
        },
      )
      .then((result) => checked(result, "Save class tags")),
    db
      .from("worksheets")
      .upsert(
        learners.map(({ worksheet }) => ({
          ...worksheet,
          submission_code_hash: hmac(
            `student:${hmac(`sample-student-code:${worksheet.id}`).slice(0, 48)}`,
          ),
        })),
      )
      .then((result) => checked(result, "Save student analysis")),
    db
      .from("background_questions")
      .upsert(
        backgroundQuestions.map(({ kind, prompt, summary }) => ({
          id: sampleId(`question/${kind}`),
          activity_id: activityId,
          kind,
          prompt,
          summary,
          status: "CLOSED",
        })),
      )
      .then((result) => checked(result, "Save background questions")),
  ]);
  const failure = report.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;

  const backgroundRows = backgroundQuestions.flatMap(
    ({ kind, answers }, questionIndex) =>
      answers.map((answer, index) => {
        const { worksheet } = learners[index + questionIndex * answers.length];
        return {
          id: sampleId(`response/${kind}/${index}`),
          activity_id: activityId,
          question_id: sampleId(`question/${kind}`),
          student_label: worksheet.student_label,
          respondent_hash: hmac(
            `student:${hmac(`sample-student-code:${worksheet.id}`).slice(0, 48)}`,
          ),
          answer,
        };
      }),
  );
  checked(
    await db.from("background_responses").upsert(backgroundRows),
    "Save background answers",
  );
  const bucket = db.storage.from("literature-images");
  for (let offset = 0; offset < images.length; offset += 5) {
    const results = await Promise.allSettled(
      images.slice(offset, offset + 5).map(async ({ source, row }) => {
        const { bytes, mime } = assets.get(source);
        checked(
          await bucket.upload(row.image_path, bytes, {
            contentType: mime,
            upsert: true,
          }),
          "Upload sample photo",
        );
      }),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  }
  checked(
    await db.from("image_submissions").upsert(images.map(({ row }) => row)),
    "Save image submissions",
  );
  const published = checked(
    await db
      .from("activities")
      .update({ deletion_pending: false })
      .eq("id", activityId)
      .eq("deletion_pending", true)
      .select("id")
      .single(),
    "Publish complete lesson",
  );
  assert.equal(published.id, activityId);
  await verifyLive(password);
}

const images = sampleRows(Date.now()).flatMap((learner) => learner.images);
const assets = await readAssets(images);
console.log(
  `Validated 25 sample worksheets, ${images.length} submissions and ${assets.size} illustrations.`,
);
if (process.argv.includes("--publish")) await publish(assets);
