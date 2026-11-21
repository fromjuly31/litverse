import { studentShell } from "../components/student-ui.js";
import { field, formErrors, icon, refreshIcons } from "../components/ui.js";
import { request } from "../services/api.js";
import { e, safeStorage } from "../utils/helpers.js";
import {
  CLASS_ANSWER_LENGTH,
  classResponseSchema,
} from "../utils/class-questions.js";

export function classQuestionsStudent(
  root,
  activity,
  token,
  code,
  label,
  data,
) {
  const sessionId = data.session.id;
  const questions = data.analysis.questions;
  const key = `litverse-class-response:${sessionId}:${code}`;
  let draft = safeStorage(key) || { student_label: label, answers: [] };
  let stopped = false;

  function draw() {
    const submitted = data.record;
    const closed = data.session.status !== "OPEN";
    studentShell(
      root,
      { ...activity, student_phase: "deepening" },
      `<div class="student-container deep-student class-questions">
        <h1 class="step-title">${e(data.title)}${data.title === "이해 심화하기" ? "" : "<small>이해 심화하기</small>"}</h1>
        ${
          submitted
            ? `<p class="notice" role="status">${icon("check")} 답변을 제출했어요.</p>
             <dl class="class-submitted-answers">${questions.map((question, index) => `<dt>${index + 1}. ${e(question)}</dt><dd>${e(submitted.answers[index])}</dd>`).join("")}</dl>`
            : closed
              ? `<p class="notice" role="status">선생님이 답변 제출을 마감했어요.</p>
               ${draft.answers.some((answer) => answer?.trim()) ? `<h2>이 기기에 임시저장한 답변</h2><dl class="class-submitted-answers">${questions.map((question, index) => `<dt>${index + 1}. ${e(question)}</dt><dd>${e(draft.answers[index] || "")}</dd>`).join("")}</dl>` : ""}`
              : `<form id="class-answer-form" novalidate>
               ${field("학생 번호 또는 별칭", "student_label", draft.student_label, { required: true, max: 40 })}
               ${questions.map((question, index) => field(`${index + 1}. ${question}`, `answer_${index}`, draft.answers[index] || "", { area: true, required: true, max: CLASS_ANSWER_LENGTH })).join("")}
               <p id="class-draft-status" class="saving" role="status"></p>
               <p id="class-answer-error" class="step-error" role="alert"></p>
               <button class="btn primary" type="submit">${icon("send")} 답변 제출하기</button>
             </form>`
        }
      </div>`,
    );
    refreshIcons();
    const form = root.querySelector("#class-answer-form");
    if (!form) return;
    const trigger = form.querySelector('button[type="submit"]');
    const errorMessage = form.querySelector("#class-answer-error");
    const persist = () => {
      draft = {
        student_label: form.elements.student_label.value,
        answers: questions.map(
          (_, index) => form.elements[`answer_${index}`].value,
        ),
      };
      form.querySelector("#class-draft-status").textContent = safeStorage(
        key,
        draft,
      )
        ? "이 기기에 임시저장됨"
        : "이 기기에 임시저장하지 못했어요.";
    };
    form.oninput = persist;
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (trigger.disabled || formErrors(form)) return;
      persist();
      const parsed = classResponseSchema.safeParse(draft);
      if (!parsed.success) {
        errorMessage.textContent =
          "학생 번호 또는 별칭과 모든 답변을 작성해 주세요.";
        return;
      }
      trigger.disabled = true;
      errorMessage.textContent = "";
      try {
        data.record = await request("deepening/student-submit", {
          token,
          code,
          session_id: sessionId,
          ...parsed.data,
        });
        safeStorage(`litverse-label:${activity.id}`, data.record.student_label);
        safeStorage(key, null);
        if (!stopped) draw();
      } catch (error) {
        if (!stopped) errorMessage.textContent = error.message;
      } finally {
        trigger.disabled = false;
      }
    };
  }
  draw();
  return () => {
    stopped = true;
  };
}
