import { studentShell } from "../components/student-ui.js";
import { teacherShell, pageHeading, showQR } from "./teacher.js";
import {
  button,
  field,
  formErrors,
  icon,
  refreshIcons,
  toast,
} from "../components/ui.js";
import { request } from "../services/api.js";
import { e, randomCode, safeStorage } from "../utils/helpers.js";
import {
  BIGKINDS_URL,
  LIFE_LIMITS,
  lifeResponseSchema,
} from "../utils/life-connection.js";

function responseMarkup(response) {
  return `<a class="text-link" href="${e(response.article_url)}" target="_blank" rel="noopener noreferrer">첨부 기사 열기 ${icon("external-link")}</a><dl class="life-response"><dt>뉴스 기사 요약</dt><dd>${e(response.article_summary)}</dd><dt>질문에 대한 답변</dt><dd>${e(response.answer)}</dd></dl>`;
}

export async function lifeTeacher(root, activity) {
  const id = activity.id;
  let data = await request("life/teacher-get", { id });
  let stopped = false;
  let busy = false;
  let refreshing = false;
  let responseCount = -1;

  async function openQR() {
    try {
      await showQR(activity, "analysis", "/life");
    } catch (error) {
      if (!stopped) toast(error.message, "error");
    }
  }

  function drawResponses() {
    if (data.responses.length === responseCount) return;
    responseCount = data.responses.length;
    root.querySelector("#life-response-count").textContent =
      `${responseCount}명 제출`;
    root.querySelector("#life-responses").innerHTML =
      data.responses
        .map(
          (response, index) =>
            `<details class="class-response"><summary>${e(response.student_label || `학생 ${index + 1}`)}</summary>${responseMarkup(response)}</details>`,
        )
        .join("") || '<p class="muted">제출된 답변이 여기에 표시됩니다.</p>';
    refreshIcons();
  }

  async function control(action, payload, trigger) {
    if (busy) return;
    busy = true;
    trigger.disabled = true;
    try {
      const prompt = await request(action, { id, ...payload });
      if (stopped) return;
      data.prompt = prompt;
      draw();
      if (prompt.is_open) await openQR();
    } catch (error) {
      if (!stopped)
        root.querySelector("#life-error").textContent = error.message;
    } finally {
      busy = false;
      trigger.disabled = false;
      if (!stopped) void refresh();
    }
  }

  function draw() {
    const { prompt, responses } = data;
    const editQuestion = !prompt || (!prompt.is_open && !responses.length);
    teacherShell(
      root,
      "life",
      activity,
      `${pageHeading("", "삶과 연계하기", "")}
      <div class="class-questions stack">
        <section class="panel stack">
          ${editQuestion ? `<form id="life-question-form" class="stack" novalidate>${field("삶과 연계하는 질문", "question", prompt?.question || "", { area: true, required: true, max: LIFE_LIMITS.question })}<div><button class="btn primary" type="submit">${icon("play")} 시작하기</button></div></form>` : `<h2>수업 질문</h2><p class="life-prompt">${e(prompt.question)}</p><div class="between wrap"><span class="badge ${prompt.is_open ? "blue" : ""}">${prompt.is_open ? "답변 받는 중" : "답변 접수 마감"}</span><div class="flex wrap">${prompt.is_open ? button("학생 참여 QR", "qr-code", "primary", 'id="life-qr"') + button("마감하기", "square", "secondary", 'id="life-close"') : button("다시 열기", "play", "primary", 'id="life-reopen"')}</div></div>`}
          <p id="life-error" class="step-error" role="alert"></p>
        </section>
        <section class="panel stack"><div class="between wrap"><h2>학생 답변</h2><span id="life-response-count" role="status"></span></div><div id="life-responses" class="stack"></div></section>
      </div>`,
    );
    root
      .querySelector("#life-question-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (formErrors(form)) return;
        void control(
          "life/start",
          { question: form.elements.question.value },
          form.querySelector("button"),
        );
      });
    root.querySelector("#life-qr")?.addEventListener("click", openQR);
    root.querySelector("#life-close")?.addEventListener("click", (event) => {
      void control("life/close", {}, event.currentTarget);
    });
    root.querySelector("#life-reopen")?.addEventListener("click", (event) => {
      void control(
        "life/start",
        { question: data.prompt.question },
        event.currentTarget,
      );
    });
    responseCount = -1;
    drawResponses();
  }
  draw();

  async function refresh() {
    if (stopped || busy || refreshing || document.hidden) return;
    refreshing = true;
    try {
      const next = await request("life/teacher-get", { id });
      if (stopped || busy) return;
      const changed =
        next.prompt?.is_open !== data.prompt?.is_open ||
        next.prompt?.question !== data.prompt?.question;
      data = next;
      root.querySelector("#life-error").textContent = "";
      if (changed) draw();
      else drawResponses();
    } catch (error) {
      if (!stopped)
        root.querySelector("#life-error").textContent = error.message;
    } finally {
      refreshing = false;
    }
  }
  const timer = setInterval(() => {
    if (data.prompt?.is_open) void refresh();
  }, 3000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export async function lifeStudent(root, token) {
  const codeKey = `litverse-life-code:${token}`;
  const code = safeStorage(codeKey) || randomCode();
  safeStorage(codeKey, code);
  let { activity, prompt, response } = await request("life/student-get", {
    token,
    code,
  });
  const draftKey = `litverse-life-draft:${activity.id}:${code}:${prompt?.question || ""}`;
  let stopped = false;

  function draw() {
    const draft = safeStorage(draftKey) || {};
    studentShell(
      root,
      activity,
      `<div class="student-container class-questions"><h1 class="step-title">삶과 연계하기</h1>
      ${prompt ? `<div class="submission-context"><strong>수업 질문</strong><p class="life-prompt">${e(prompt.question)}</p></div>` : ""}
      ${
        response
          ? `<p class="notice" role="status">답변을 제출했어요.</p>${responseMarkup(response)}`
          : !prompt?.is_open
            ? `<p class="notice">${prompt ? "선생님이 답변 접수를 마감했어요." : "선생님이 질문을 열면 참여할 수 있어요."}</p>`
            : `<form id="life-response-form" class="worksheet-form" novalidate>
          <a class="btn secondary" href="${BIGKINDS_URL}" target="_blank" rel="noopener noreferrer">${icon("external-link")} 빅카인즈에서 기사 찾기</a>
          ${field("뉴스 기사 링크", "article_url", draft.article_url, { type: "url", required: true, max: LIFE_LIMITS.article_url, placeholder: "https://" })}
          ${field("뉴스 기사 요약", "article_summary", draft.article_summary, { area: true, required: true, max: LIFE_LIMITS.article_summary })}
          ${field("질문에 대한 답변", "answer", draft.answer, { area: true, required: true, max: LIFE_LIMITS.answer })}
          <p class="step-error" id="life-submit-error" role="alert"></p>
          <button class="btn primary" type="submit">${icon("send")} 답변 제출하기</button>
        </form>`
      }
    </div>`,
    );
    const form = root.querySelector("#life-response-form");
    if (!form) return;
    const collect = () => Object.fromEntries(new FormData(form));
    form.oninput = () => safeStorage(draftKey, collect());
    form.onsubmit = async (event) => {
      event.preventDefault();
      const trigger = form.querySelector("button");
      if (trigger.disabled || formErrors(form)) return;
      const errorMessage = form.querySelector("#life-submit-error");
      const parsed = lifeResponseSchema.safeParse(collect());
      if (!parsed.success) {
        errorMessage.textContent =
          "올바른 뉴스 기사 주소와 요약, 답변을 입력해 주세요.";
        return;
      }
      trigger.disabled = true;
      errorMessage.textContent = "";
      try {
        response = await request("life/student-submit", {
          token,
          code,
          question: prompt.question,
          student_label: safeStorage(`litverse-label:${activity.id}`) || "",
          ...parsed.data,
        });
        safeStorage(draftKey, null);
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
