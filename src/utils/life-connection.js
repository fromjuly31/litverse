import { z } from "zod";

export const BIGKINDS_URL = "https://www.bigkinds.or.kr/";
export const LIFE_LIMITS = {
  question: 500,
  article_url: 2048,
  article_summary: 2000,
  answer: 4000,
};
export const lifeQuestionSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIFE_LIMITS.question);
export const lifeResponseSchema = z.object({
  article_url: z
    .url({ protocol: /^https?$/ })
    .max(LIFE_LIMITS.article_url)
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          /^https?:\/\//.test(value) &&
          !url.username &&
          !url.password &&
          !/\s/.test(value)
        );
      } catch {
        return false;
      }
    }),
  article_summary: z.string().trim().min(1).max(LIFE_LIMITS.article_summary),
  answer: z.string().trim().min(1).max(LIFE_LIMITS.answer),
});
export const lifeLabelSchema = z.string().trim().max(40).default("");

export const lifeErrors = {
  LIFE_NOT_STARTED: "선생님이 질문을 열면 참여할 수 있어요.",
  LIFE_QUESTION_LOCKED: "이미 공개했거나 답변을 받은 질문은 그대로 유지됩니다.",
  LIFE_QUESTION_CHANGED:
    "선생님이 질문을 바꿨어요. 화면을 다시 열어 확인해 주세요.",
  LIFE_CLOSED: "선생님이 답변 접수를 마감했어요.",
  LIFE_ALREADY_SUBMITTED:
    "이미 답변을 제출했어요. 화면을 다시 열어 제출 내용을 확인해 주세요.",
};
