import QRCode from "qrcode";
import { navigate } from "../main.js";
import { teacherShell, pageHeading } from "./teacher.js";
import { request, subscribe } from "../services/api.js";
import { rememberAccess } from "../services/access.js";
import {
  button,
  copyText,
  customSelect,
  field,
  formErrors,
  icon,
  initSelects,
  openModal,
  refreshIcons,
  toast,
} from "../components/ui.js";
import { e, randomCode } from "../utils/helpers.js";
import { currentRoute, publicRouteUrl, routeHref } from "../utils/paths.js";
import {
  CLASS_QUESTION_LENGTH,
  MAX_CLASS_QUESTIONS,
  classQuestionsSchema,
} from "../utils/class-questions.js";

const pathFor = (id) => `/teacher/activity/${id}/deepening`;

function tabValue(key, value) {
  try {
    if (value === undefined) return JSON.parse(sessionStorage.getItem(key));
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The current form still works when the browser blocks storage.
  }
}

const passwordKey = (id) => `litverse-deep-password:${id}`;

export function classQuestionsEditor(root, activity) {
  const key = `litverse-class-questions:${activity?.id || "new"}`;
  const cancelPath = !activity
    ? "/teacher?tab=deepening"
    : activity.deepening_session_id
      ? pathFor(activity.id)
      : `/teacher/activity/${activity.id}/background`;
  const draft = tabValue(key) || {
    title: "",
    author: "",
    count: 1,
    questions: [],
    activityId: activity?.id || crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    password: activity ? null : randomCode().slice(0, 16),
  };
  const count = customSelect({
    name: "question_count",
    label: "질문 수",
    value: String(draft.count),
    options: Array.from({ length: MAX_CLASS_QUESTIONS }, (_, index) => ({
      value: String(index + 1),
      label: `${index + 1}개`,
    })),
  });
  teacherShell(
    root,
    "deepening-editor",
    activity,
    `${pageHeading("", activity ? `${e(activity.title)} · 이해 심화하기` : "심화 수업 만들기", "")}
    <form id="class-questions-form" class="panel class-questions stack" novalidate>
      ${activity ? "" : `<div class="form-grid">${field("수업 이름 (선택)", "title", draft.title, { max: 120, placeholder: "이해 심화하기" })}${field("작가 (선택)", "author", draft.author, { max: 80 })}</div>`}
      ${count}
      <div id="class-question-fields" class="stack"></div>
      <p class="step-error" role="alert" id="class-start-error"></p>
      <div class="flex wrap"><button class="btn primary" type="submit">${icon("play")} 시작하기</button><a class="btn ghost" href="${cancelPath}">취소</a></div>
    </form>`,
  );
  const form = root.querySelector("#class-questions-form");
  const fields = form.querySelector("#class-question-fields");
  const trigger = form.querySelector('[type="submit"]');
  const errorMessage = form.querySelector("#class-start-error");
  let stopped = false;

  function drawFields() {
    fields.innerHTML = Array.from({ length: draft.count }, (_, index) =>
      field(
        `질문 ${index + 1}`,
        `question_${index}`,
        draft.questions[index] || "",
        {
          area: true,
          max: CLASS_QUESTION_LENGTH,
          required: true,
        },
      ),
    ).join("");
  }
  const persist = () => {
    if (!activity) {
      draft.title = form.elements.title.value;
      draft.author = form.elements.author.value;
    }
    [...fields.querySelectorAll("textarea")].forEach((entry, index) => {
      draft.questions[index] = entry.value;
    });
    tabValue(key, draft);
  };
  form.addEventListener("input", persist);
  form.elements.question_count.addEventListener("change", (event) => {
    persist();
    draft.count = Number(event.target.value);
    drawFields();
    tabValue(key, draft);
  });
  drawFields();

  form.onsubmit = async (event) => {
    event.preventDefault();
    if (trigger.disabled || formErrors(form)) return;
    persist();
    errorMessage.textContent = "";
    const parsed = classQuestionsSchema.safeParse(
      draft.questions.slice(0, draft.count),
    );
    if (!parsed.success) {
      errorMessage.textContent = "선택한 개수만큼 질문을 모두 작성해 주세요.";
      return;
    }
    trigger.disabled = true;
    try {
      const started = await request("deepening/questions-start", {
        ...(activity
          ? { id: activity.id }
          : {
              activity_id: draft.activityId,
              password: draft.password,
              input: {
                title: draft.title.trim() || "이해 심화하기",
                author: draft.author.trim() || "미입력",
              },
            }),
        request_id: draft.requestId,
        questions: parsed.data,
      });
      if (started.access) {
        rememberAccess(started.id, started.access);
        tabValue(passwordKey(started.id), draft.password);
      }
      tabValue(key, null);
      if (!stopped) await navigate(`${pathFor(started.id)}?qr=1`);
    } catch (error) {
      if (!stopped) errorMessage.textContent = error.message;
    } finally {
      trigger.disabled = false;
    }
  };
  initSelects(root);
  return () => {
    stopped = true;
  };
}

export function classQuestionsTeacher(root, activity, data, showQr = false) {
  const path = pathFor(activity.id);
  const questions = data.work.reviewed_analysis.questions;
  const sessionId = data.session.id;
  const password = tabValue(passwordKey(activity.id));
  const historical = sessionId !== activity.deepening_session_id;
  let stopped = false,
    refreshing = false,
    openingQr = false,
    previousStatus,
    responseSignature;
  const count =
    data.sessions.length > 1
      ? customSelect({
          name: "class_round",
          label: "회차",
          value: sessionId,
          options: data.sessions.map((session) => ({
            value: session.id,
            label: `${session.round}회차`,
          })),
        })
      : "";
  teacherShell(
    root,
    "deepening",
    activity,
    `${pageHeading("", e(activity.title), "이해 심화하기")}
    <div class="class-questions stack">
      <section class="panel stack" aria-label="심화 수업">
        <div class="between wrap"><p id="class-session-status" class="badge"></p><div class="flex wrap" id="class-session-actions"></div></div>
        ${count}
        <details><summary>질문 ${questions.length}개</summary><ol class="class-question-list">${questions.map((question) => `<li>${e(question)}</li>`).join("")}</ol></details>
        ${password ? `<details><summary>수업 비밀번호</summary><p class="deep-password"><code>${e(password)}</code> ${button("복사", "copy", "secondary small", 'id="class-copy-password"')}</p></details>` : ""}
      </section>
      <section class="panel stack"><div class="between wrap"><h2>학생 답변</h2><p id="class-response-count" role="status"></p></div><div id="class-responses" class="stack"></div><p id="class-sync-error" class="step-error" role="alert"></p></section>
    </div>`,
  );
  const actions = root.querySelector("#class-session-actions");
  const responseCount = root.querySelector("#class-response-count");
  const responses = root.querySelector("#class-responses");
  const errorMessage = root.querySelector("#class-sync-error");

  async function qr() {
    if (openingQr || stopped) return;
    openingQr = true;
    try {
      const { worksheet_token } = await request("teacher/links", {
        id: activity.id,
      });
      const url = publicRouteUrl(
        `/activity/${worksheet_token}/deepening/${sessionId}`,
      );
      const image = await QRCode.toDataURL(url, {
        width: 600,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      if (stopped) return;
      const modal = openModal({
        title: "학생 참여 QR",
        body: `<div class="qr-paper class-questions-qr"><img src="${image}" alt="심화 수업 참여 QR 코드"/></div>`,
        footer: `${button("링크 복사", "copy", "secondary", 'id="class-copy-link"')}<a class="btn primary" href="${e(url)}" target="_blank" rel="noopener">학생 화면 열기</a>`,
      });
      modal.element.querySelector("#class-copy-link").onclick = () =>
        copyText(url);
    } catch (error) {
      if (!stopped) toast(error.message, "error");
    } finally {
      openingQr = false;
    }
  }

  function draw() {
    const open = data.session.status === "OPEN";
    if (previousStatus !== data.session.status) {
      previousStatus = data.session.status;
      const status = root.querySelector("#class-session-status");
      status.textContent = open ? "답변 받는 중" : "마감";
      status.classList.toggle("blue", open);
      actions.innerHTML = open
        ? `${button("학생 참여 QR", "qr-code", "primary", 'id="class-qr"')}${button("마감하기", "square", "secondary", 'id="class-close"')}`
        : historical
          ? `<a class="btn secondary" href="${path}">현재 회차로</a>`
          : `<a class="btn primary" href="${path}/new">새 회차 만들기</a>`;
      actions.querySelector("#class-qr")?.addEventListener("click", qr);
      actions.querySelector("#class-close")?.addEventListener("click", close);
      refreshIcons();
    }
    const records = data.records
      .filter((record) => record.answers_submitted_at)
      .slice()
      .reverse();
    const signature = records.map((record) => record.id).join(",");
    if (responseSignature === signature) return;
    responseSignature = signature;
    responseCount.textContent = `${records.length}명 제출`;
    const expanded = new Map(
      [...responses.querySelectorAll("details")].map((entry) => [
        entry.dataset.record,
        entry.open,
      ]),
    );
    responses.innerHTML =
      records
        .map(
          (record) =>
            `<details class="class-response" data-record="${e(record.id)}" ${(expanded.get(record.id) ?? true) ? "open" : ""}><summary>${e(record.student_label)}</summary><dl>${questions
              .map(
                (question, index) =>
                  `<dt>${index + 1}. ${e(question)}</dt><dd>${e(record.answers[index])}</dd>`,
              )
              .join("")}</dl></details>`,
        )
        .join("") || '<p class="muted">제출된 답변이 여기에 표시됩니다.</p>';
  }

  async function refresh() {
    if (stopped || refreshing) return;
    refreshing = true;
    try {
      const next = await request("deepening/get", {
        id: activity.id,
        session_id: sessionId,
      });
      if (!stopped) {
        data = next;
        errorMessage.textContent = "";
        draw();
      }
    } catch (error) {
      if (!stopped) errorMessage.textContent = error.message;
    } finally {
      refreshing = false;
    }
  }

  async function close(event) {
    const trigger = event.currentTarget;
    trigger.disabled = true;
    try {
      const session = await request("deepening/control", {
        id: activity.id,
        session_id: sessionId,
        status: "CLOSED",
        visibility: "private",
        phase:
          activity.lesson_kind === "deepening" ? "deepening" : "understanding",
      });
      if (!stopped) {
        data.session = session;
        draw();
        await refresh();
      }
    } catch (error) {
      if (!stopped) toast(error.message, "error");
    } finally {
      trigger.disabled = false;
    }
  }

  root
    .querySelector("#class-copy-password")
    ?.addEventListener("click", () => copyText(password));
  root
    .querySelector("[name=class_round]")
    ?.addEventListener("change", (event) => {
      const id = event.target.value;
      navigate(id === activity.deepening_session_id ? path : `${path}/${id}`);
    });
  initSelects(root);
  draw();
  if (showQr && data.session.status === "OPEN") {
    history.replaceState(
      history.state,
      "",
      routeHref(currentRoute().split("?")[0]),
    );
    void qr();
  }
  const unsubscribe = subscribe(activity.id, refresh);
  // Password access is checked by the server, so those teachers need polling.
  const timer = setInterval(() => {
    if (!document.hidden && data.session.status === "OPEN") void refresh();
  }, 3000);
  document.addEventListener("visibilitychange", refresh);
  return () => {
    stopped = true;
    unsubscribe();
    clearInterval(timer);
    document.removeEventListener("visibilitychange", refresh);
  };
}
