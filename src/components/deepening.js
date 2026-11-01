import { e } from "../utils/helpers.js";
import { field, customSelect, icon } from "./ui.js";
import {
  GENRES,
  PURPOSES,
  REFLECTIONS,
  progressLabel,
} from "../utils/deepening.js";

export function learningTabs(active = "understanding", activity = null) {
  const base = activity ? `/teacher/activity/${e(activity.id)}` : null;
  const understanding =
    base && activity.lesson_kind !== "deepening"
      ? `${base}/background`
      : "/teacher?tab=understanding";
  return `<nav class="learning-tabs" aria-label="수업 분야"><a href="${understanding}" ${active === "understanding" ? 'aria-current="page"' : ""}>${icon("book-open")} 작품 파악하기</a><a href="${base ? `${base}/deepening` : "/teacher?tab=deepening"}" ${active === "deepening" ? 'aria-current="page"' : ""}>${icon("messages-square")} 이해 심화하기</a></nav>`;
}
export const analysisFields = {
  characters: "주요 인물 또는 화자",
  situation: "핵심 사건 또는 상황",
  conflict: "중심 갈등 및 문제 상황",
  choice: "중요한 선택 또는 태도",
  theme: "주제 및 핵심 가치",
  context: "시대적·사회적 맥락",
  connection: "현대의 삶과 연결할 문제",
  opening_question: "최초 판단 질문",
};
export function analysisForm(a) {
  return `${customSelect({ name: "genre", label: "문학 갈래", value: a.genre, options: Object.entries(GENRES).map(([value, label]) => ({ value, label })) })}<div class="deep-analysis-fields">${Object.entries(
    analysisFields,
  )
    .map(([name, label]) =>
      field(label, name, a[name], { area: true, required: true, max: 1800 }),
    )
    .join(
      "",
    )}</div>${field("최초 판단 선택지 · 한 줄에 하나", "options", a.options.join("\n"), { area: true, required: true, max: 1000 })}<h3>AI 장애 시에도 사용할 공통 질문</h3><p class="muted">서로 다른 세 목적을 유지하며, 정답을 강요하지 않는 질문으로 다듬어 주세요.</p>${Object.entries(
    PURPOSES,
  )
    .map(([key, label]) =>
      field(label, `common_${key}`, a.common_questions[key], {
        area: true,
        required: true,
        max: 1000,
      }),
    )
    .join("")}`;
}
export function readAnalysis(form, original) {
  const values = Object.fromEntries(new FormData(form));
  return {
    ...original,
    identified: true,
    genre: values.genre,
    ...Object.fromEntries(
      Object.keys(analysisFields).map((k) => [k, values[k].trim()]),
    ),
    options: values.options
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    common_questions: Object.fromEntries(
      Object.keys(PURPOSES).map((k) => [k, values[`common_${k}`].trim()]),
    ),
  };
}
export function analysisSummary(a) {
  return `<div class="deep-work-summary"><span class="badge">${e(GENRES[a.genre])}</span><h3>${e(a.opening_question)}</h3><p>${e(a.situation)}</p><details><summary>작품 분석과 탐구 맥락 보기</summary><dl>${Object.entries(
    analysisFields,
  )
    .filter(([k]) => k !== "opening_question")
    .map(([k, label]) => `<div><dt>${label}</dt><dd>${e(a[k])}</dd></div>`)
    .join("")}</dl></details></div>`;
}
export function reflectionMarkup(r) {
  return `<div class="reflection-pair"><section><span class="eyebrow">BEFORE · 최초 생각</span><h3>${e(r.initial?.choice)}</h3><p>${e(r.initial?.reason)}</p><small>작품 속 근거</small><p>${e(r.initial?.evidence)}</p></section><section><span class="eyebrow">AFTER · 최종 성찰</span><h3>${e(REFLECTIONS[r.reflection?.stance]?.[0] || "생각을 깊이 읽는 중")}</h3><p>${e(r.reflection?.answer || "아직 최종 성찰을 작성하지 않았습니다.")}</p></section></div>`;
}
export function recordDetail(r) {
  return `${reflectionMarkup(r)}<div class="deep-answer-list">${Object.entries(
    PURPOSES,
  )
    .map(
      ([key, label]) =>
        `<section><span class="eyebrow">${label}</span><h3>${e(r.questions?.[key] || "질문 준비 중")}</h3><p>${e(r.answers?.[key] || "아직 작성하지 않았습니다.")}</p></section>`,
    )
    .join("")}</div>`;
}
export function perspectiveCards(records, teacher = false) {
  return `<div class="perspective-grid">${records.map((r) => `<button class="perspective-card" data-record="${e(r.id)}"><span class="eyebrow">${e(teacher ? r.student_label : r.display_name)}</span>${teacher ? `<span class="badge">${e(progressLabel(r))}</span>` : ""}<h3>${e(r.initial?.choice || "최초 생각을 준비하고 있어요.")}</h3><p>${e(r.initial?.reason || "작품의 근거를 모으는 중입니다.")}</p><span class="text-link">생각 자세히 보기 ${icon("arrow-up-right")}</span></button>`).join("")}</div>`;
}
