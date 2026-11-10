import test from "node:test";
import assert from "node:assert/strict";
import {
  textParagraphs,
  speechSegments,
  textStudySchema,
} from "../src/utils/text-study.js";
import { createNarrator } from "../src/services/narrator.js";
import { runDeletion } from "../netlify/lib/server.js";

test("deleting a lesson cleans its private PDF attachments and its images", async () => {
  const removed = [];
  let finished = false;
  const db = {
    rpc: async (name) => ({
      data:
        name === "claim_deletion"
          ? {
              id: "job",
              target_type: "activity",
              activity_id: "lesson",
              image_paths: ["lesson/image.webp"],
            }
          : ((finished = true), { ok: true }),
    }),
    storage: {
      from: (bucket) => ({
        list: async () => ({ data: [{ name: "text-abcd-1234.pdf" }] }),
        remove: async (paths) => {
          removed.push({ bucket, paths });
          return { data: {} };
        },
      }),
    },
  };
  await runDeletion(db, "job");
  assert.deepEqual(removed, [
    { bucket: "literature-texts", paths: ["lesson/text-abcd-1234.pdf"] },
    { bucket: "literature-images", paths: ["lesson/image.webp"] },
  ]);
  assert.ok(finished);
});

test("PDF fragments form selectable paragraphs without merging distant columns", () => {
  const blocks = textParagraphs(
    [
      { text: "첫 문단의", x: 50, y: 100, width: 60, height: 14 },
      { text: "첫 줄이다.", x: 115, y: 100, width: 70, height: 14 },
      { text: "첫 문단의 다음 줄이다.", x: 50, y: 120, width: 140, height: 14 },
      { text: "둘째 문단이다.", x: 50, y: 170, width: 140, height: 14 },
      { text: "오른쪽 열이다.", x: 340, y: 100, width: 140, height: 14 },
    ],
    600,
    800,
    2,
  );
  assert.equal(blocks.length, 3);
  assert.match(blocks[0].text, /첫 줄이다.*다음 줄이다/);
  assert.ok(
    blocks.every(
      (block) => block.page === 2 && block.rect.x >= 0 && block.rect.width <= 1,
    ),
  );
  assert.ok(!blocks[0].text.includes("오른쪽"));
});

test("text-study validation keeps the optional path and bounds actual reading content", () => {
  assert.ok(
    textStudySchema.safeParse({ enabled: false, paragraphs: [] }).success,
  );
  assert.equal(
    textStudySchema.safeParse({ enabled: true, paragraphs: [] }).success,
    false,
  );
  assert.equal(
    textStudySchema.safeParse({
      enabled: true,
      paragraphs: [{ id: "one", text: " " }],
    }).success,
    false,
  );
  assert.ok(
    textStudySchema.safeParse({
      enabled: true,
      source_name: "본문.pdf",
      paragraphs: [{ id: "one", text: "우리의 본문", page: 1 }],
    }).success,
  );
  assert.equal(
    textStudySchema.safeParse({
      enabled: true,
      paragraphs: Array.from({ length: 301 }, (_, i) => ({
        id: String(i),
        text: "본문",
      })),
    }).success,
    false,
  );
});

test("long narration uses bounded chunks with original offsets and cancels on navigation", () => {
  const text = "본문을 천천히 읽습니다. ".repeat(70) + "마지막 문장입니다.";
  const parts = speechSegments(text);
  assert.equal(parts.map((part) => part.text).join(""), text);
  assert.ok(
    parts.every(
      (part) =>
        part.text.length <= 150 &&
        text.slice(part.offset, part.offset + part.text.length) === part.text,
    ),
  );
  const synth = {
    spoken: [],
    cancelCount: 0,
    paused: false,
    speak(utterance) {
      this.spoken.push(utterance);
    },
    cancel() {
      this.cancelCount++;
    },
    pause() {
      this.paused = true;
    },
    resume() {
      this.paused = false;
    },
  };
  class Utterance {
    constructor(text) {
      this.text = text;
    }
  }
  let completed = 0;
  const narrator = createNarrator({
    synth,
    Utterance,
    onFinished: () => completed++,
  });
  const voice = { voiceURI: "test-korean", lang: "ko-KR" };
  narrator.start(text, { voice, rate: 0.85, pitch: 1.2 });
  const first = synth.spoken[0];
  assert.equal(first.voice, voice);
  assert.equal(first.rate, 0.85);
  assert.equal(first.pitch, 1.2);
  narrator.pause();
  assert.equal(narrator.status, "paused");
  assert.ok(synth.paused);
  narrator.resume();
  assert.equal(narrator.status, "speaking");
  first.onend();
  assert.equal(synth.spoken.length, 2);
  const second = synth.spoken[1];
  narrator.stop();
  second.onend();
  assert.equal(synth.spoken.length, 2);
  assert.equal(completed, 0);
  assert.equal(narrator.status, "idle");
});
