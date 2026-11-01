import { z } from "zod";
import { synopsisExamples } from "./archive.js";

export const GENRES = {
  novel: "소설",
  poetry: "시",
  drama: "희곡",
  essay: "수필",
  classical: "고전문학",
};
export const PURPOSES = {
  context: "현실과 맥락 탐구",
  values: "가치 판단",
  life: "문학과 삶 연결",
};
export const REFLECTIONS = {
  same: [
    "처음과 같은 생각이다",
    "다른 관점을 검토하고도 기존 생각을 유지하게 된 가장 중요한 근거는 무엇인가요?",
  ],
  changed: [
    "다른 생각으로 바뀌었다",
    "어떤 질문이나 다른 사람의 의견이 생각을 바꾸는 데 결정적이었나요?",
  ],
  expanded: [
    "기존 생각이 더 깊어지고 확장되었다",
    "처음에는 고려하지 못했지만 새롭게 발견한 조건이나 가치는 무엇인가요?",
  ],
};
const short = z.string().trim().max(1800);
export const analysisInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  author: z.string().trim().min(1).max(80),
  source_text: z.string().trim().max(12000).default(""),
  edition: z.string().trim().max(160).default(""),
});
export const questionSchema = z
  .object({
    context: z.string().trim().min(8).max(1000),
    values: z.string().trim().min(8).max(1000),
    life: z.string().trim().min(8).max(1000),
  })
  .strict()
  .refine(
    (q) => new Set(Object.values(q)).size === 3,
    "서로 다른 목적의 질문 세 개가 필요합니다.",
  );
export const analysisSchema = z
  .object({
    identified: z.boolean(),
    uncertainty: z.string().max(1000),
    genre: z.enum(Object.keys(GENRES)),
    characters: short,
    situation: short,
    conflict: short,
    choice: short,
    theme: short,
    context: short,
    connection: short,
    opening_question: short,
    options: z.array(z.string().trim().min(1).max(250)).min(2).max(4),
    common_questions: questionSchema,
  })
  .strict();
export const reviewedSchema = analysisSchema.refine(
  (a) =>
    a.identified &&
    [
      "characters",
      "situation",
      "conflict",
      "choice",
      "theme",
      "context",
      "connection",
      "opening_question",
    ].every((k) => a[k].length >= 5),
  "작품 정보와 탐구 질문을 확인하고 모든 분석 항목을 5자 이상 작성해 주세요.",
);
export const initialSchema = z
  .object({
    choice: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(5).max(4000),
    evidence: z.string().trim().min(5).max(4000),
  })
  .strict();
export const reflectionSchema = z
  .object({
    stance: z.enum(Object.keys(REFLECTIONS)),
    answer: z.string().trim().min(10).max(5000),
  })
  .strict();
export const startingQuestions = {
  novel: "인물의 결정적인 선택을 어떻게 판단하나요? 다른 선택도 가능했을까요?",
  poetry:
    "화자의 정서와 태도를 어떻게 이해하나요? 그 가치관에 대한 나의 생각은 무엇인가요?",
  drama: "갈등 속 인물의 말과 행동을 어떤 입장에서 바라보나요?",
  essay:
    "글쓴이가 경험을 통해 얻은 깨달음에 동의하나요? 다른 생각도 가능한가요?",
  classical:
    "당시의 규범 속 선택을 오늘날의 관점에서는 어떻게 해석할 수 있을까요?",
};
export function commonQuestions(genre = "novel") {
  const subject =
    genre === "poetry" ? "화자" : genre === "essay" ? "글쓴이" : "인물";
  return {
    context: `${subject}의 생각이나 행동을 이해하려면 어떤 시대적·사회적 조건을 함께 살펴보아야 할까요? 본문에서 근거를 찾아보세요.`,
    values: `나의 판단에서 중요하게 본 가치와 다른 관점에서 중요하게 볼 가치는 무엇인가요? 둘이 충돌할 때 어떻게 판단할 수 있을까요?`,
    life: `작품의 문제와 비슷한 갈등을 오늘날의 일상이나 사회에서 찾을 수 있나요? 개인과 공동체는 각각 무엇을 할 수 있을까요?`,
  };
}
export function manualAnalysis(input, genre = "novel") {
  return {
    identified: false,
    uncertainty:
      "작품을 확실히 식별하지 못했습니다. 줄거리·핵심 지문과 수록본을 입력하거나 아래 분석을 직접 완성해 주세요.",
    genre,
    characters: "",
    situation: input.source_text?.slice(0, 1600) || "",
    conflict: "",
    choice: "",
    theme: "",
    context: "",
    connection: "",
    opening_question: startingQuestions[genre],
    options: [
      "제시된 선택이나 태도에 동의한다",
      "다른 관점에서 해석한다",
      "판단을 더 검토하고 싶다",
    ],
    common_questions: commonQuestions(genre),
  };
}
export function demoAnalysis(input) {
  const key = `${input.title.replace(/\s/g, "")}|${input.author.replace(/\s/g, "")}`;
  const samples = {
    "운수좋은날|현진건": [
      "novel",
      "김 첨지와 그의 아내",
      "생계를 위해 인력거를 끄는 김 첨지는 병든 아내를 두고 일을 나간다.",
      "가난한 삶의 조건 속에서 생계와 가족 돌봄의 요구가 충돌한다.",
      "아내 곁에 머물거나 생계를 위해 일을 나가는 선택을 검토한다.",
      "가난과 돌봄, 비극적 현실과 반어적인 제목을 함께 읽는다.",
      "일제강점기 도시 빈민의 불안정한 생계와 의료·돌봄의 조건을 살펴본다.",
      "생계와 가족 돌봄을 함께 감당하는 오늘날의 문제와 연결한다.",
      "당신이 김 첨지라면 어떤 선택을 하겠습니까?",
      [
        "아내 곁에 머물며 돌본다",
        "생계를 위해 일을 나간다",
        "다른 해결 방법을 찾아본다",
      ],
    ],
    "동백꽃|김유정": [
      "novel",
      "점순이와 일인칭 서술자 ‘나’",
      "점순이와 ‘나’ 사이에서 감자를 건네고 거절하는 일과 닭싸움이 이어진다.",
      "서로의 마음을 제대로 알아차리지 못하는 관계와 소작 관계의 차이를 함께 살핀다.",
      "서툴게 표현된 호의와 갈등에 어떻게 대응할지 생각한다.",
      "관심을 표현하는 방식과 상대의 마음을 이해하는 과정을 탐구한다.",
      "농촌의 생활과 점순이네·나의 가족 사이 소작 관계를 본문과 대조한다.",
      "다른 사람의 마음을 성급히 단정하는 일상적 관계와 연결한다.",
      "서로의 마음을 이해하지 못하는 두 인물에게 어떤 대응이 필요하다고 생각하나요?",
      [
        "상대의 마음을 직접 물어본다",
        "행동의 이유와 관계의 조건을 살핀다",
        "거리를 두고 상황을 다시 생각한다",
      ],
    ],
    "서시|윤동주": [
      "poetry",
      "자신의 삶을 돌아보는 시의 화자",
      "화자는 자신의 삶과 태도를 성찰하고 앞으로 살아갈 방향을 다짐한다.",
      "부끄러움 없는 삶을 향한 지향과 현실 속에서 느끼는 고민을 함께 읽는다.",
      "화자가 추구하는 삶의 태도에 동의하거나 다른 관점에서 해석한다.",
      "양심과 성찰, 자신에게 주어진 삶에 대한 책임을 탐구한다.",
      "작품의 창작 시기와 시대적 조건은 교사가 사용하는 판본의 해설과 대조한다.",
      "스스로 세운 기준과 현실 사이에서 고민하는 우리의 삶과 연결한다.",
      "화자가 삶을 성찰하는 태도를 어떻게 받아들이나요?",
      [
        "나도 추구하고 싶은 태도이다",
        "현실의 조건을 함께 고려해야 한다",
        "다른 삶의 태도도 가능하다",
      ],
    ],
  };
  // An excerpt or different edition is never silently replaced by the built-in example.
  if (
    !samples[key] ||
    (input.source_text && input.source_text !== synopsisExamples[key]) ||
    input.edition
  )
    return {
      analysis: manualAnalysis(input),
      source: "manual",
      note: "데모에서는 알려진 내장 예시만 제공하며 AI를 호출하지 않습니다.",
    };
  const [
    genre,
    characters,
    situation,
    conflict,
    choice,
    theme,
    context,
    connection,
    opening_question,
    options,
  ] = samples[key];
  return {
    analysis: {
      identified: true,
      uncertainty: "교사가 원문과 대조해야 하는 내장 예시입니다.",
      genre,
      characters,
      situation,
      conflict,
      choice,
      theme,
      context,
      connection,
      opening_question,
      options,
      common_questions: commonQuestions(genre),
    },
    source: "example",
    note: "내장 수업 예시 · 실제 AI 분석이 아닙니다.",
  };
}
export function personalizedFallback(analysis, initial) {
  const base = analysis.common_questions;
  return {
    context: `‘${initial.choice.slice(0, 100)}’라는 판단의 근거로 ‘${initial.evidence.slice(0, 160)}’를 들었군요. ${base.context.slice(0, 700)}`,
    values: `‘${initial.reason.slice(0, 180)}’라는 이유를 다른 입장에서 검토해 보세요. ${base.values.slice(0, 700)}`,
    life: `‘${initial.choice.slice(0, 100)}’라는 나의 판단을 오늘날의 상황에 적용하면 어떨까요? ${base.life.slice(0, 700)}`,
  };
}
export function progressLabel(r) {
  return r.completed_at
    ? "전체 활동 완료"
    : r.peer_viewed_at
      ? "최종 성찰 작성 중"
      : r.answers_submitted_at
        ? "다른 관점 감상 대기"
        : r.initial
          ? "심화 질문 작성 중"
          : "최초 판단 작성 중";
}
export function publicRecord(r, index = 0) {
  return {
    id: r.id,
    display_name: `관점 ${String(index + 1).padStart(2, "0")}`,
    initial: r.initial,
    questions: r.questions,
    answers: r.answers,
    reflection: r.reflection,
    completed_at: r.completed_at,
  };
}
export function studentChange(record, operation, data, session) {
  if (session.status !== "OPEN")
    throw new Error(
      "지금은 심화 활동의 작성 시간이 아닙니다. 저장된 내용은 계속 볼 수 있어요.",
    );
  if (record.completed_at)
    throw new Error(
      "완료한 성찰은 보존됩니다. 새로운 회차에서 다시 참여해 주세요.",
    );
  const now = new Date().toISOString();
  if (operation === "initial") {
    const initial = initialSchema.parse(data);
    if (
      record.initial &&
      JSON.stringify(record.initial) !== JSON.stringify(initial)
    )
      throw new Error("최초 판단은 비교를 위해 보존됩니다.");
    return {
      initial,
      initial_submitted_at: record.initial_submitted_at || now,
    };
  }
  if (!record.initial || !record.questions)
    throw new Error("최초 판단과 심화 질문을 먼저 준비해 주세요.");
  if (operation === "answer") {
    const { purpose, answer } = z
      .object({
        purpose: z.enum(Object.keys(PURPOSES)),
        answer: z.string().max(5000),
      })
      .parse(data);
    return {
      answers: { ...record.answers, [purpose]: answer },
      answers_submitted_at: null,
      peer_viewed_at: null,
    };
  }
  if (operation === "submit-answers") {
    if (
      !Object.keys(PURPOSES).every(
        (k) => record.answers?.[k]?.trim().length >= 5,
      )
    )
      throw new Error("세 질문에 5자 이상의 답변을 각각 작성해 주세요.");
    return { answers_submitted_at: now };
  }
  if (!record.answers_submitted_at)
    throw new Error("세 답변을 먼저 제출해 주세요.");
  if (operation === "viewed") {
    if (session.visibility === "private")
      throw new Error("선생님이 다른 관점 감상을 열면 진행할 수 있어요.");
    return { peer_viewed_at: now };
  }
  if (operation === "reflection") {
    if (!record.peer_viewed_at)
      throw new Error("다른 관점을 먼저 감상해 주세요.");
    return { reflection: reflectionSchema.parse(data), completed_at: now };
  }
  throw new Error("지원하지 않는 심화 활동입니다.");
}
