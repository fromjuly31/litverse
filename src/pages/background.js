import { teacherShell, pageHeading, showQR } from "./teacher.js";
import { studentShell, backgroundSummary } from "../components/student-ui.js";
import {
  icon,
  button,
  field,
  customSelect,
  initSelects,
  refreshIcons,
  formErrors,
  toast,
  confirmDialog,
} from "../components/ui.js";
import { request, subscribe, isDemo } from "../services/api.js";
import { e, safeStorage, randomCode } from "../utils/helpers.js";
import { render } from "../main.js";
import { navigate } from "../main.js";
import { synopsisPanel, bindSynopsis } from "../components/synopsis.js";
const kinds = { temporal: "시간적 배경", spatial: "공간적 배경" };
export async function backgroundTeacher(root, data) {
  const id = data.activity.id;
  let questions,
    answers,
    stopped = false;
  const drafts = new Map();
  ({ questions, responses: answers } = await request("teacher/background", {
    id,
  }));
  teacherShell(
    root,
    "background",
    data.activity,
    `${pageHeading("READ THE WORLD OF THE STORY", "배경 탐구", "교사의 질문 → 학생의 QR 응답 → 교사의 최종 정리", `${button("배경 질문 QR", "qr-code", "secondary", 'id="background-qr"')}${button(data.activity.stage === "BACKGROUND" ? "다음: 인물·사건 분석" : "배경 탐구 시작", "arrow-right", "primary", 'id="background-stage"')}`, true)}${synopsisPanel(data.activity.synopsis, true)}<div class="background-teacher-layout"><section class="panel question-editor"><span class="eyebrow">ASK YOUR CLASS</span><h2 style="margin-top:12px">함께 생각할 질문</h2><form id="question-form" class="stack" novalidate style="margin-top:24px"><div class="field"><span>탐구할 배경</span>${customSelect({ name: "kind", label: "탐구할 배경", value: "temporal", options: Object.entries(kinds).map(([value, label]) => ({ value, label })) })}</div>${field("학생들에게 보낼 질문", "prompt", "", { area: true, required: true, max: 1500, placeholder: "예: 이 작품의 시대나 계절을 짐작하게 하는 본문 속 단서는 무엇인가요?" })}<p class="step-error" role="alert" id="question-error"></p><button type="submit" class="btn primary">${icon("plus")} 질문 공개하기</button></form><div class="notice" style="margin-top:22px">${icon("info")}<span>학생 응답은 선생님만 볼 수 있어요. 최종 정리를 공유하면 이후 인물·사건 프롬프트에 반영됩니다.</span></div></section><div><div class="section-heading"><h2>우리 반의 생각 모으기</h2><span class="badge blue" id="background-connection">${isDemo ? "데모 연결" : "실시간 연결 중"}</span></div><div class="stack" id="questions"></div></div></div><section class="panel" style="margin-top:25px"><span class="eyebrow">OUR SHARED CONTEXT</span><h2 style="margin-top:12px">선생님이 정리한 작품의 배경</h2><div id="teacher-background-summary">${summaryCards(data.activity)}</div></section>`,
  );
  if (
    data.activity.stage === "BACKGROUND" &&
    data.activity.settings?.text_study?.enabled
  )
    root.querySelector("#background-stage").innerHTML =
      `다음: 본문 학습 ${icon("arrow-right")}`;
  bindSynopsis(
    root,
    () => ({ title: data.activity.title, author: data.activity.author }),
    id,
  );
  const draw = () => {
    root.querySelector("#questions").innerHTML = questions.length
      ? [...questions]
          .reverse()
          .map((q) => {
            const responses = answers.filter((r) => r.question_id === q.id);
            return `<article class="panel question-card" data-question="${e(q.id)}"><div class="between wrap"><span class="badge blue">${kinds[q.kind]}</span><span class="muted" style="font-size:11px">${q.status === "OPEN" ? "응답 받는 중" : "응답 마감"} · ${responses.length}명 응답</span></div><h3 style="margin:18px 0;line-height:1.7">${e(q.prompt)}</h3><div class="background-responses">${responses.length ? responses.map((r) => `<div class="background-response"><span>${e(r.student_label)}</span><p>${e(r.answer)}</p></div>`).join("") : '<p class="muted" style="font-size:12px">학생들의 첫 응답을 기다리고 있어요.</p>'}</div><div style="margin-top:24px">${field("선생님의 최종 정리", `summary-${q.id}`, drafts.get(q.id) ?? q.summary, { area: true, max: 5000, placeholder: "학생들의 응답과 본문을 바탕으로 시간적·공간적 배경을 최종 정리해 주세요." })}</div><div class="flex wrap" style="margin-top:16px">${button("최종 정리 공유", "check", "primary", `data-publish-summary="${e(q.id)}"`)}${button(q.status === "OPEN" ? "응답 마감" : "응답 다시 열기", q.status === "OPEN" ? "lock-keyhole" : "rotate-ccw", "secondary", `data-question-state="${e(q.id)}"`)}</div>${q.summary ? '<p class="muted" style="font-size:11px;margin-top:12px">정리 내용이 학생에게 공유되었습니다.</p>' : ""}</article>`;
          })
          .join("")
      : '<div class="empty">시간적 배경과 공간적 배경에 대한 질문을 하나씩 만들어 보세요.</div>';
    refreshIcons();
  };
  draw();
  const reload = async () => {
    const result = await request("teacher/background", { id });
    if (stopped) return;
    questions = result.questions;
    answers = result.responses;
    data.activity = result.activity;
    root.querySelector("#teacher-background-summary").innerHTML = summaryCards(
      data.activity,
    );
    if (!root.querySelector("#questions textarea:focus")) draw();
    else
      root.querySelectorAll("[data-question]").forEach((card) => {
        const responses = answers.filter(
          (r) => r.question_id === card.dataset.question,
        );
        card.querySelector(".background-responses").innerHTML = responses
          .map(
            (r) =>
              `<div class="background-response"><span>${e(r.student_label)}</span><p>${e(r.answer)}</p></div>`,
          )
          .join("");
      });
  };
  root.querySelector("#question-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    if (formErrors(form)) return;
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      await request("teacher/question-save", {
        id,
        kind: form.elements.kind.value,
        prompt: form.elements.prompt.value.trim(),
      });
      form.elements.prompt.value = "";
      await reload();
      toast("질문을 공개했어요.");
    } catch (error) {
      root.querySelector("#question-error").textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  };
  root.querySelector("#questions").oninput = (ev) => {
    if (ev.target.name?.startsWith("summary-"))
      drafts.set(ev.target.name.slice(8), ev.target.value);
  };
  root.querySelector("#questions").onclick = async (ev) => {
    const publish = ev.target.closest("[data-publish-summary]"),
      change = ev.target.closest("[data-question-state]");
    if (!publish && !change) return;
    const q = questions.find(
      (q) =>
        q.id ===
        (publish?.dataset.publishSummary || change.dataset.questionState),
    );
    const summary = drafts.get(q.id) ?? q.summary;
    if (publish && !summary.trim()) {
      toast("최종 정리를 작성한 뒤 공유해 주세요.", "error");
      return;
    }
    const btn = publish || change;
    btn.disabled = true;
    try {
      await request("teacher/question-update", {
        id,
        question_id: q.id,
        status: publish ? "CLOSED" : q.status === "OPEN" ? "CLOSED" : "OPEN",
        summary: publish ? summary : q.summary,
      });
      drafts.delete(q.id);
      await reload();
      toast(
        publish
          ? "배경 정리를 학생들과 공유했어요."
          : "응답 상태를 변경했어요.",
      );
    } catch (error) {
      toast(error.message, "error");
      btn.disabled = false;
    }
  };
  root.querySelector("#background-qr").onclick = () =>
    showQR(data.activity, "analysis");
  root.querySelector("#background-stage").onclick = () => {
    if (
      data.activity.stage === "BACKGROUND" &&
      data.activity.settings?.text_study?.enabled
    ) {
      return navigate(`/teacher/activity/${id}/text-study`);
    }
    const next =
      data.activity.stage === "BACKGROUND" ? "ANALYSIS" : "BACKGROUND";
    confirmDialog({
      title:
        next === "BACKGROUND"
          ? "배경 질문에 응답하도록 열까요?"
          : "인물·사건 분석을 시작할까요?",
      message:
        next === "BACKGROUND"
          ? "학생은 활동 QR로 접속해 시간적·공간적 배경에 관한 질문에 응답합니다."
          : "배경 응답을 마치고 인물의 성격·근거와 인상 깊은 사건을 작성합니다. 최종 정리를 먼저 공유해 주세요.",
      confirm: "단계 변경",
      onConfirm: async () => {
        await request("teacher/stage", { id, stage: next });
        await render();
      },
    });
  };
  initSelects(root);
  const unsub = subscribe(
    id,
    () => reload().catch((error) => toast(error.message, "error")),
    (state) => {
      const target = root.querySelector("#background-connection");
      if (target)
        target.textContent =
          state === "demo"
            ? "같은 브라우저 데모"
            : state === "connected"
              ? "실시간 연결됨"
              : "연결 복구 중";
    },
  );
  return () => {
    stopped = true;
    unsub();
  };
}
function summaryCards(activity) {
  return `<div class="background-summary-grid">${[
    ["temporal_background", "시간적 배경"],
    ["spatial_background", "공간적 배경"],
  ]
    .map(
      ([key, label]) =>
        `<article><span class="eyebrow">${label}</span><p>${e(activity[key] || "학생 응답을 살펴본 뒤 선생님의 최종 정리를 공유해 주세요.")}</p></article>`,
    )
    .join("")}</div>`;
}
export function backgroundStudent(root, activity, token) {
  let kind = "temporal",
    label = safeStorage(`litverse-label:${activity.id}`) || "",
    code = safeStorage(`litverse-code:${activity.id}`) || randomCode(),
    stopped = false,
    busy = false;
  safeStorage(`litverse-code:${activity.id}`, code);
  let questions = activity.questions || [];
  let activeId;
  function draw() {
    const list = questions.filter((q) => q.kind === kind);
    const question =
      [...list].reverse().find((q) => q.status === "OPEN") || list.at(-1);
    activeId = question?.id;
    const saved = question
      ? safeStorage(`litverse-background:${question.id}`) || {}
      : {};
    studentShell(
      root,
      activity,
      `<div class="student-container"><span class="eyebrow">FIRST, READ THE WORLD OF THE STORY</span><h1 class="step-title">이 이야기는<br/>언제, 어디에서 펼쳐질까요?</h1><p class="step-hint">본문에서 단서를 찾아 선생님의 질문에 응답해 주세요.<br/>우리의 생각을 모아 작품의 배경을 함께 정리합니다.</p><div class="work-tabs" role="tablist" aria-label="작품의 배경">${Object.entries(
        kinds,
      )
        .map(
          ([key, name]) =>
            `<button type="button" role="tab" aria-selected="${kind === key}" data-background-kind="${key}">${icon(key === "temporal" ? "clock" : "book-open")}<span>${name}</span></button>`,
        )
        .join(
          "",
        )}</div><section class="background-student-question">${question ? `<span class="badge blue">${kinds[kind]} · ${question.status === "OPEN" ? "응답 받는 중" : "응답 마감"}</span><h2>${e(question.prompt)}</h2>${question.status === "OPEN" ? `<form class="worksheet-form" novalidate>${field("학생 번호 또는 별칭", "student_label", label, { required: true, max: 40 })}${field("본문을 바탕으로 나의 생각 쓰기", "answer", saved.answer || "", { area: true, required: true, max: 3000, hint: "어떤 단서로 그렇게 생각했는지 5자 이상 적어 주세요." })}<p class="step-error" id="background-error" role="alert"></p><button class="btn primary" type="submit">${icon("check")} ${saved.submitted ? "응답 수정해서 보내기" : "내 응답 보내기"}</button></form><p id="answer-status" class="student-note" role="status">${saved.submitted ? "선생님께 응답을 보냈어요. 정리를 기다려 주세요." : ""}</p>` : '<div class="notice">선생님이 응답을 마감했어요. 최종 정리를 함께 읽어 보세요.</div>'}${question.summary ? `<section class="teacher-summary"><span class="eyebrow">선생님의 최종 정리</span><p>${e(question.summary)}</p></section>` : ""}` : '<div class="empty">선생님이 질문을 준비하고 있어요.<br/>질문이 열리면 이 화면에 나타납니다.</div>'}</section>${backgroundSummary(activity)}<p class="student-note">다음 활동에서는 인물의 성격과 근거, 인상 깊은 사건과 이유를 작성하고 사진 두 장을 완성해요.</p></div>`,
    );
    root.querySelectorAll("[data-background-kind]").forEach((btn) => {
      btn.onclick = () => {
        kind = btn.dataset.backgroundKind;
        draw();
      };
      btn.onkeydown = (ev) => {
        if (["ArrowLeft", "ArrowRight"].includes(ev.key)) {
          ev.preventDefault();
          kind = kind === "temporal" ? "spatial" : "temporal";
          draw();
          root.querySelector(`[data-background-kind="${kind}"]`).focus();
        }
      };
    });
    const form = root.querySelector("form");
    if (!form) return;
    form.oninput = () => {
      label = form.elements.student_label.value;
      safeStorage(`litverse-label:${activity.id}`, label);
      safeStorage(`litverse-background:${question.id}`, {
        ...saved,
        answer: form.elements.answer.value,
      });
    };
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      if (busy || formErrors(form)) return;
      if (form.elements.answer.value.trim().length < 5) {
        root.querySelector("#background-error").textContent =
          "본문의 단서를 5자 이상 구체적으로 써 주세요.";
        return;
      }
      busy = true;
      form.querySelector("button").disabled = true;
      try {
        const answer = form.elements.answer.value.trim();
        await request("student/background-answer", {
          token,
          code,
          question_id: question.id,
          student_label: label.trim(),
          answer,
        });
        if (stopped) return;
        safeStorage(`litverse-background:${question.id}`, {
          answer,
          submitted: true,
        });
        draw();
      } catch (error) {
        root.querySelector("#background-error").textContent = error.message;
      } finally {
        busy = false;
        form.querySelector("button").disabled = false;
      }
    };
  }
  let last = JSON.stringify(questions);
  const sync = async () => {
    if (stopped || busy) return;
    try {
      const next = await request("student/activity", { token });
      if (stopped) return;
      if (next.stage !== "BACKGROUND") {
        await render();
        return;
      }
      const serialized = JSON.stringify(next.questions);
      activity = next;
      questions = next.questions || [];
      if (serialized !== last) {
        last = serialized;
        draw();
      }
    } catch (error) {
      if (!stopped)
        root
          .querySelector("#answer-status")
          ?.replaceChildren(
            document.createTextNode(
              "연결을 확인하고 있어요. 작성 내용은 이 기기에 저장됩니다.",
            ),
          );
    }
  };
  draw();
  const timer = setInterval(sync, 15000);
  const unsub = isDemo ? subscribe(activity.id, sync) : () => {};
  return () => {
    stopped = true;
    clearInterval(timer);
    unsub();
  };
}
