export const MAX_SUBMISSION_QUESTIONS = 3;
export const QUESTION_MAX_LENGTH = 300;
export const ANSWER_MAX_LENGTH = 2000;
export const EXAMPLE_SUBMISSION_QUESTION = "내가 파악한 인물의 특징은?";

export const submissionQuestions = (activity) =>
  activity.settings?.submission_questions || [];

const invalid = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};

export function validateSubmissionQuestions(questions) {
  if (
    !Array.isArray(questions) ||
    questions.length < 1 ||
    questions.length > MAX_SUBMISSION_QUESTIONS ||
    questions.some(
      (question) =>
        typeof question !== "string" ||
        !question.trim() ||
        question.trim().length > QUESTION_MAX_LENGTH,
    )
  )
    invalid("사진 제출 질문은 1~3개, 각 300자 이내로 작성해 주세요.");
  return questions.map((question) => question.trim());
}

export function validateQuestionResponses(activity, responses = []) {
  const questions = submissionQuestions(activity);
  if (
    !Array.isArray(responses) ||
    responses.length !== questions.length ||
    responses.length > MAX_SUBMISSION_QUESTIONS
  )
    invalid("선생님이 설정한 모든 질문에 답해 주세요.");
  return questions.map((question, index) => {
    const response = responses[index];
    if (
      response?.question !== question ||
      typeof response.answer !== "string" ||
      !response.answer.trim() ||
      response.answer.trim().length > ANSWER_MAX_LENGTH
    )
      invalid(`질문 ${index + 1}에 1~${ANSWER_MAX_LENGTH}자로 답해 주세요.`);
    return { question, answer: response.answer.trim() };
  });
}
