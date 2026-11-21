import { z } from "zod";

export const MAX_CLASS_QUESTIONS = 10;
export const CLASS_QUESTION_LENGTH = 500;
export const CLASS_ANSWER_LENGTH = 4000;

export const classQuestionsSchema = z
  .array(z.string().trim().min(1).max(CLASS_QUESTION_LENGTH))
  .min(1)
  .max(MAX_CLASS_QUESTIONS);

export const classResponseSchema = z.object({
  student_label: z.string().trim().min(1).max(40),
  answers: z
    .array(z.string().trim().min(1).max(CLASS_ANSWER_LENGTH))
    .min(1)
    .max(MAX_CLASS_QUESTIONS),
});

export const isClassQuestions = (analysis) =>
  analysis?.mode === "class_questions";

export function classQuestionAnalysis(questions) {
  return {
    mode: "class_questions",
    questions: classQuestionsSchema.parse(questions),
  };
}
