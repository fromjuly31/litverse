import { z } from "zod";
import { normalizeTags } from "../../src/utils/domain.js";
import {
  MAX_SUBMISSION_QUESTIONS,
  QUESTION_MAX_LENGTH,
  ANSWER_MAX_LENGTH,
} from "../../src/utils/submission-questions.js";
const text = (min, max) => z.string().trim().min(min).max(max);
const optional = (max = 3000) => z.string().trim().max(max).default("");
export const uuid = z.string().uuid();
export const token = z.string().regex(/^[a-f0-9]{48,64}$/);
export const code = z.string().regex(/^[a-f0-9]{48}$/);
const tags = (max) =>
  z
    .array(text(1, 20))
    .min(1)
    .max(max)
    .transform((v) => normalizeTags(v, max))
    .refine((v) => v.length > 0, "유효한 키워드를 입력해 주세요.");
export const activitySchema = z.object({
  title: text(1, 120),
  author: text(1, 80),
  synopsis: optional(1800),
  course_name: optional(120),
  class_name: optional(80),
  introduction: text(1, 3000),
  objectives: optional(2000),
  standards: optional(1000),
  tasks: z.array(text(1, 300)).min(1).max(20),
  prompt_template: optional(2000),
  background: optional(2000),
  default_image_style: text(1, 100),
  expected_student_count: z.number().int().min(1).max(1000),
  tags: z
    .array(text(1, 20))
    .max(50)
    .transform((v) => normalizeTags(v, 50)),
  settings: z.object({
    allow_resubmit: z.boolean(),
    require_approval: z.boolean(),
    enable_scene: z.literal(true),
    max_images: z.literal(1),
    submission_questions: z
      .array(text(1, QUESTION_MAX_LENGTH))
      .min(1)
      .max(MAX_SUBMISSION_QUESTIONS)
      .optional(),
  }),
});
export const worksheetSchema = z.object({
  student_label: text(1, 40),
  character_name: text(1, 80),
  character_selection_reason: text(1, 2000),
  personality_tags: tags(3),
  personality_description: text(20, 4000),
  textual_evidence: text(20, 4000),
  evidence_quote: optional(2000),
  evidence_explanation: text(10, 4000),
  canonical_appearance: optional(3000),
  imagined_appearance: text(20, 4000),
  visual_description: optional(2000),
  background: optional(2000),
  image_style: optional(100),
  scene: z.object({
    name: text(10, 3000),
    reason: text(10, 3000),
    development: text(10, 3000),
    behavior: text(10, 3000),
    impact: optional(3000),
    visual: text(10, 3000),
    image_style: optional(100),
  }),
});
export const uploadSchema = z.object({
  request_id: uuid,
  image_type: z.enum(["character", "scene"]),
  slot: z.literal(0),
  size: z
    .number()
    .int()
    .min(1)
    .max(5 * 1024 * 1024),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  hashtags: tags(5),
  one_line_description: text(1, 150),
  question_responses: z
    .array(
      z.object({
        question: text(1, QUESTION_MAX_LENGTH),
        answer: text(1, ANSWER_MAX_LENGTH),
      }),
    )
    .max(MAX_SUBMISSION_QUESTIONS)
    .default([]),
});
export const questionSchema = z.object({
  kind: z.enum(["temporal", "spatial"]),
  prompt: text(5, 1500),
});
export const responseSchema = z.object({
  question_id: uuid,
  student_label: text(1, 40),
  answer: text(5, 3000),
});
export const aliasSchema = z
  .record(text(1, 20), text(1, 20))
  .refine(
    (v) =>
      Object.keys(v).length <= 100 &&
      Object.entries(v).every(
        ([k, t]) =>
          k !== t &&
          !Object.hasOwn(v, t) &&
          normalizeTags([k])[0] === k &&
          normalizeTags([t])[0] === t,
      ),
    "유효한 대표 태그로 직접 연결해 주세요.",
  );
export const idsSchema = z
  .array(uuid)
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length);
export function validImageSignature(bytes, mime) {
  if (mime === "image/png")
    return (
      bytes.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
    );
  if (mime === "image/jpeg")
    return (
      bytes.length >= 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    );
  if (mime === "image/webp")
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}
