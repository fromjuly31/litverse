import { field, button, customSelect, icon, formErrors } from "./ui.js";
import { synopsisPanel } from "./synopsis.js";
import { DEFAULT_TAGS, STYLES } from "../utils/domain.js";
import { e } from "../utils/helpers.js";
import {
  LESSON_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  passwordLengthError,
} from "../utils/password.js";

const steps = [
  [
    "작품과 수업",
    "함께 읽을 작품을 소개해 주세요.",
    "작품과 수업의 기본 정보를 정해요. 별표가 있는 항목은 꼭 입력해 주세요.",
  ],
  [
    "줄거리와 목표",
    "어떤 이야기를 함께 나눌까요?",
    "줄거리와 수업 목표는 선택 사항이에요. 필요한 내용만 작성하고 다음으로 이동하세요.",
  ],
  [
    "활동과 설정",
    "우리 수업에 맞게 다듬어 보세요.",
    "기본 활동을 그대로 사용하거나, 순서와 안내를 자유롭게 바꿀 수 있어요.",
  ],
  [
    "확인과 시작",
    "준비한 수업을 확인해 주세요.",
    "입력한 내용을 살펴보고, 수업을 다시 열 때 사용할 비밀번호를 정해 주세요.",
  ],
];

const cardHeading = (title, description = "") =>
  `<div class="editor-card-heading"><h3>${title}</h3>${description ? `<p>${description}</p>` : ""}</div>`;

export function lessonEditorView(a) {
  const passwordOptions = {
    type: "password",
    required: true,
    max: PASSWORD_MAX_LENGTH,
    minLength: LESSON_PASSWORD_MIN_LENGTH,
    autocomplete: "new-password",
  };
  const panels = [
    `<section class="panel editor-section"><div class="form-grid">
      ${field("작품 제목", "title", a?.title, { required: true, max: 120, placeholder: "예: 동백꽃" })}
      ${field("작가", "author", a?.author, { required: true, max: 80, placeholder: "예: 김유정" })}
      <div class="full">${field("수업명", "course_name", a?.course_name, { max: 120, placeholder: "예: 문학의 다양한 시선", hint: "수업 목록에서 알아보기 쉬운 이름을 붙여 주세요." })}</div>
      <div class="full">${field("수업 소개", "introduction", a?.introduction, { area: true, required: true, max: 3000, placeholder: "학생들에게 작품과 활동을 짧게 소개해 주세요." })}</div>
      ${field("예상 참여 인원", "expected_student_count", a?.expected_student_count ?? 30, { type: "number", hint: "실제 참여 인원과 구분해 표시해요." })}
      <div class="field"><span id="image-style-label">기본 이미지 스타일</span>${customSelect({ name: "default_image_style", label: "기본 이미지 스타일", value: a?.default_image_style || STYLES[0], options: STYLES })}<small>학생은 활동 중 다른 스타일을 선택할 수 있어요.</small></div>
    </div></section>`,
    `<div class="wizard-columns equal-columns">${synopsisPanel(a?.synopsis)}
      <section class="panel editor-section">${cardHeading("수업 목표", "작품을 읽고 함께 발견할 내용을 적어 주세요.")}
        <div class="stack">${field("수업 목표", "objectives", a?.objectives, { area: true, max: 2000, placeholder: "예: 인물의 말과 행동을 근거로 성격을 해석하고, 서로 다른 해석을 비교한다." })}
        ${field("교과 성취기준", "standards", a?.standards, { max: 1000, placeholder: "예: 작품을 다양한 관점에서 해석하고 평가한다.", hint: "필요한 경우 교육과정의 코드와 문구를 입력해 주세요." })}</div>
        <div class="editor-tip">${icon("info")}<p>줄거리와 목표는 수업을 만든 뒤에도 수정할 수 있어요.</p></div>
      </section>
    </div>`,
    `<div class="wizard-columns">
      <section class="panel editor-section">${cardHeading("학생 활동 안내", "수업에 맞게 순서를 바꾸거나 활동을 추가해 보세요.")}
        <div class="field"><span>학생이 해야 할 일 <b class="required" aria-hidden="true">*</b></span><div class="task-list" id="task-list"></div><div>${button("할 일 추가", "plus", "secondary", 'type="button" id="add-task"')}</div></div>
        <details class="editor-details"><summary>배경·표현 안내 추가 <span>선택</span>${icon("chevron-down")}</summary><div class="stack">
          ${field("작품의 배경 정보", "background", a?.background, { area: true, max: 2000, placeholder: "학생들이 참고할 작품의 배경을 적어 주세요." })}
          ${field("프롬프트에 덧붙일 표현 안내", "prompt_template", a?.prompt_template, { area: true, max: 2000, hint: "학생의 해석을 바꾸지 않는 공통 표현 안내를 작성해 주세요." })}
        </div></details>
      </section>
      <section class="panel editor-section">${cardHeading("수업에 맞는 설정", "기본 설정으로도 바로 시작할 수 있어요.")}
        <div class="stack">${field("기본 성격 키워드", "tags", (a?.tags || DEFAULT_TAGS).join(", "), { area: true, hint: "쉼표로 구분해 주세요. 학생도 키워드를 추가할 수 있어요." })}
        ${[
          [
            "allow_resubmit",
            "학생 이미지 재제출 허용",
            "학생이 자신의 해석과 이미지를 다시 다듬을 수 있어요.",
          ],
          [
            "require_approval",
            "공개 전시 전 교사 승인 필요",
            "선생님이 확인한 작품만 전시해요.",
          ],
        ]
          .map(
            ([name, label, hint]) =>
              `<label class="check-field editor-setting"><input type="checkbox" name="${name}" ${(a?.settings?.[name] ?? true) ? "checked" : ""}/><span><strong>${label}</strong><small>${hint}</small></span></label>`,
          )
          .join("")}
        <div class="editor-tip">${icon("images")}<p>학생은 인물 사진과 사건 장면 사진을 각각 한 장씩 제출해요.</p></div></div>
      </section>
    </div>`,
    `<div class="wizard-columns review-columns"><section class="panel editor-section">${cardHeading("수업 미리보기", "수정할 내용이 있으면 해당 단계로 돌아갈 수 있어요.")}<div id="lesson-review" class="lesson-review"></div></section>
      <section class="panel editor-section class-password-panel">${cardHeading(a ? "수업 준비 완료" : "이 수업의 비밀번호", a ? "확인한 내용으로 수업 정보를 저장해 주세요." : "이 비밀번호로 수업을 다시 열 수 있어요.")}
        ${a ? `<div class="editor-tip">${icon("lock-keyhole")}<p>기존 수업 비밀번호로 계속 이용할 수 있어요.</p></div>` : `<div class="stack">${field("수업 비밀번호", "password", "", { ...passwordOptions, placeholder: "4자리 이상 입력", hint: "4자리 이상 · 숫자와 문자를 사용할 수 있어요." })}${field("비밀번호 확인", "confirm_password", "", { ...passwordOptions, placeholder: "같은 비밀번호를 한 번 더 입력" })}</div><div class="editor-tip">${icon("lock-keyhole")}<p>수업을 이어갈 때 필요하니 따로 기억해 주세요. 비밀번호는 공개되지 않아요.</p></div>`}
      </section></div>`,
  ];

  return `<form id="activity-form" class="editor lesson-wizard" novalidate>
    <div class="wizard-navigation">
      <div class="wizard-progress-heading"><span class="wizard-current" role="status" aria-live="polite">1 / 4 단계 · 작품과 수업</span><span class="wizard-progress-note">한 단계씩, 우리만의 수업 준비</span></div>
      <div class="wizard-progress" role="progressbar" aria-label="수업 준비 진행 상황" aria-valuemin="0" aria-valuemax="4" aria-valuenow="1"><span></span></div>
      <div role="tablist" aria-label="수업 만들기 단계" class="wizard-tabs">${steps.map(([label], i) => `<button type="button" role="tab" id="editor-tab-${i}" aria-label="${i + 1}단계 ${label}" aria-controls="editor-step-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-editor-step="${i}" class="wizard-tab"><span class="wizard-step-number" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><span class="wizard-tab-copy"><strong>${label}</strong><small>${i === 0 ? "현재 단계" : "입력 전"}</small></span></button>`).join("")}</div>
    </div>
    ${steps
      .map(
        (
          [label, title, description],
          i,
        ) => `<section id="editor-step-${i}" role="tabpanel" aria-labelledby="editor-tab-${i}" class="wizard-step" ${i ? "hidden" : ""}>
      <div class="wizard-panel-heading"><div><span class="eyebrow">STEP ${String(i + 1).padStart(2, "0")} / ${label}</span><h2 tabindex="-1">${i === 3 && a ? "변경한 수업 정보를 확인해 주세요." : title}</h2><p>${i === 3 && a ? "준비가 끝났다면 변경 사항을 저장해 주세요." : description}</p></div><span class="wizard-optional">${i === 1 ? "선택 입력" : i === 0 ? "* 필수 입력" : ""}</span></div>${panels[i]}</section>`,
      )
      .join("")}
    <p class="step-error wizard-error" role="alert" id="editor-error"></p>
    <footer class="wizard-footer"><a class="wizard-cancel" href="${a ? `/teacher/activity/${e(a.id)}/settings` : "/teacher"}">취소</a><span class="wizard-footer-note">단계를 이동해도 입력한 내용은 유지돼요.</span><div class="wizard-footer-buttons">${button("이전 단계", "arrow-left", "secondary", 'type="button" id="editor-prev" hidden')}${button("다음 단계", "arrow-right", "primary", 'type="button" id="editor-next"')}<button type="submit" class="btn primary" id="editor-submit" hidden>${icon("check")}${a ? "변경 사항 저장" : "수업 만들기"}</button></div></footer>
  </form>`;
}

export function bindLessonWizard(form, { editing, getTasks }) {
  let current = 0;
  const completed = new Set();
  const panels = [...form.querySelectorAll(".wizard-step")];
  const tabs = [...form.querySelectorAll("[data-editor-step]")];
  const error = form.querySelector("#editor-error");
  const value = (name) => form.elements.namedItem(name)?.value || "";
  const tasks = () =>
    getTasks()
      .map((task) => task.trim())
      .filter(Boolean);

  const fieldProblem = (name, message) => {
    const input = form.elements.namedItem(name);
    input.setAttribute("aria-invalid", "true");
    let notice = input.closest(".field").querySelector(".field-error");
    if (!notice) {
      notice = document.createElement("small");
      notice.className = "field-error";
      input.closest(".field").append(notice);
    }
    notice.textContent = message;
    error.textContent = message;
    input.focus();
    return false;
  };

  const stepValid = (step) => {
    if (step === 0) {
      const count = Number(value("expected_student_count"));
      return (
        ["title", "author", "introduction"].every((name) =>
          value(name).trim(),
        ) &&
        Number.isInteger(count) &&
        count >= 1 &&
        count <= 1000
      );
    }
    if (step === 2) return tasks().length > 0;
    if (step === 3 && !editing)
      return (
        !passwordLengthError(value("password")) &&
        value("password") === value("confirm_password")
      );
    return true;
  };

  const review = () => {
    const line = (label, text) =>
      `<div><dt>${label}</dt><dd>${e(text || "입력하지 않음")}</dd></div>`;
    const heading = (label, step) =>
      `<div class="review-heading"><h4>${label}</h4><button type="button" class="text-link" data-review-step="${step}" aria-label="${label} 수정">수정 ${icon("arrow-up-right")}</button></div>`;
    form.querySelector("#lesson-review").innerHTML =
      `<div>${heading("작품과 수업", 0)}<dl class="review-facts">${line("작품", `${value("title")} · ${value("author")}`)}${line("수업명", value("course_name"))}${line("참여 인원", `${value("expected_student_count")}명`)}${line("이미지 스타일", value("default_image_style"))}</dl></div>
      <div>${heading("줄거리와 목표", 1)}<p class="review-excerpt">${e(value("objectives") || value("synopsis") || "별도로 입력한 줄거리와 목표가 없어요. 수업 중에도 추가할 수 있어요.")}</p></div>
      <div>${heading("활동과 설정", 2)}<p class="review-excerpt">학생 활동 ${tasks().length}개 · ${form.elements.require_approval.checked ? "교사 승인 후 전시" : "바로 전시"} · ${form.elements.allow_resubmit.checked ? "재제출 허용" : "재제출 닫힘"}</p></div>`;
  };

  const updateNavigation = () => {
    tabs.forEach((tab, i) => {
      const done = completed.has(i) && stepValid(i);
      tab.setAttribute("aria-selected", String(i === current));
      tab.tabIndex = i === current ? 0 : -1;
      tab.classList.toggle("is-complete", done && i !== current);
      tab.querySelector("small").textContent =
        i === current ? "현재 단계" : done ? "입력 완료" : "입력 전";
      tab.querySelector(".wizard-step-number").textContent =
        done && i !== current ? "✓" : String(i + 1).padStart(2, "0");
    });
    form.querySelector(".wizard-current").textContent =
      `${current + 1} / ${steps.length} 단계 · ${steps[current][0]}`;
    form
      .querySelector(".wizard-progress")
      .setAttribute("aria-valuenow", String(current + 1));
    form
      .querySelector(".wizard-progress")
      .setAttribute(
        "aria-valuetext",
        `${current + 1} / 4 단계 · ${steps[current][0]}`,
      );
    form.querySelector(".wizard-progress > span").style.width =
      `${((current + 1) / steps.length) * 100}%`;
    form.querySelector("#editor-prev").hidden = current === 0;
    form.querySelector("#editor-next").hidden = current === steps.length - 1;
    form.querySelector("#editor-submit").hidden = current !== steps.length - 1;
  };

  const showStep = (step, focus = true) => {
    current = step;
    panels.forEach((panel, i) => {
      panel.hidden = i !== current;
    });
    error.textContent = "";
    updateNavigation();
    if (step === 3) review();
    if (focus) {
      panels[step].querySelector("h2").focus({ preventScroll: true });
      form
        .querySelector(".wizard-navigation")
        .scrollIntoView({ block: "start", behavior: "instant" });
    }
  };

  const validateStep = (step) => {
    error.textContent = "";
    if (formErrors(panels[step])) {
      error.textContent = "별표가 있는 필수 항목을 입력해 주세요.";
      return false;
    }
    if (step === 0) {
      const count = Number(value("expected_student_count"));
      if (!Number.isInteger(count) || count < 1 || count > 1000)
        return fieldProblem(
          "expected_student_count",
          "예상 참여 인원은 1~1,000 사이의 정수로 입력해 주세요.",
        );
    }
    if (step === 2 && !tasks().length) {
      error.textContent = "학생이 해야 할 일을 하나 이상 작성해 주세요.";
      (
        form.querySelector("[data-task]") || form.querySelector("#add-task")
      ).focus();
      return false;
    }
    if (step === 3 && !editing) {
      const problem = passwordLengthError(value("password"));
      if (problem) return fieldProblem("password", problem);
      if (value("password") !== value("confirm_password"))
        return fieldProblem(
          "confirm_password",
          "비밀번호 확인이 일치하지 않아요. 같은 비밀번호를 입력해 주세요.",
        );
    }
    completed.add(step);
    return true;
  };

  const next = () => {
    if (validateStep(current)) showStep(Math.min(current + 1, 3));
  };
  form.querySelector("#editor-next").onclick = next;
  form.querySelector("#editor-prev").onclick = () =>
    showStep(Math.max(0, current - 1));
  tabs.forEach((tab, i) => {
    tab.onclick = () => showStep(i);
    tab.onkeydown = (event) => {
      const keys = {
        ArrowRight: (i + 1) % 4,
        ArrowLeft: (i + 3) % 4,
        Home: 0,
        End: 3,
      };
      if (!(event.key in keys)) return;
      event.preventDefault();
      showStep(keys[event.key], false);
      tabs[keys[event.key]].focus();
    };
  });
  form.querySelector("#lesson-review").onclick = (event) => {
    const trigger = event.target.closest("[data-review-step]");
    if (trigger) showStep(Number(trigger.dataset.reviewStep));
  };
  form.addEventListener("input", (event) => {
    const input = event.target;
    input.removeAttribute("aria-invalid");
    input.closest(".field")?.querySelector(".field-error")?.remove();
    error.textContent = "";
    updateNavigation();
  });
  const count = form.elements.expected_student_count;
  count.min = "1";
  count.max = "1000";
  count.step = "1";
  showStep(0, false);

  return {
    next,
    get current() {
      return current;
    },
    validateAll() {
      for (let i = 0; i < steps.length; i++) {
        if (!stepValid(i)) {
          showStep(i);
          validateStep(i);
          return false;
        }
      }
      return true;
    },
  };
}
