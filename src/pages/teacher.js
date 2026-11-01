import {
  icon,
  button,
  customSelect,
  initSelects,
  refreshIcons,
  field,
  formErrors,
  openModal,
  confirmDialog,
  copyText,
  toast,
} from "../components/ui.js";
import { request, isDemo, subscribe } from "../services/api.js";
import { e, downloadText, safeStorage } from "../utils/helpers.js";
import { publicRouteUrl, currentRoute } from "../utils/paths.js";
import {
  STAGES,
  DEFAULT_TASKS,
  DEFAULT_TAGS,
  STYLES,
  normalizeTags,
  submissionProgress,
} from "../utils/domain.js";
import { artCard, showArt } from "../components/art.js";
import { galleryPage, analyticsPage } from "./gallery.js";
import { navigate, render } from "../main.js";
import QRCode from "qrcode";
import { dashboard } from "./dashboard.js";
import { backgroundTeacher } from "./background.js";
import { unlockPage, adminPage } from "./lesson-access.js";
import { rememberAccess, forgetLessons } from "../services/access.js";
import { finalizePage, completedLesson } from "./finalize.js";
import { showcasePage } from "./showcase.js";
import { museumHeader, museumFooter } from "../components/museum-shell.js";
import { synopsisPanel, bindSynopsis } from "../components/synopsis.js";
import { learningTabs } from "../components/deepening.js";
import { deepeningTeacher, deepeningEditor } from "./deepening-teacher.js";
export function teacherShell(root, page, activity, content) {
  const base = activity ? `/teacher/activity/${e(activity.id)}` : "";
  const deep = page.startsWith("deepening");
  safeStorage("litverse-learning-tab", deep ? "deepening" : "understanding");
  const tabs =
    activity && !deep
      ? [
          ["background", "book-open", "배경 탐구", `${base}/background`],
          ["gallery", "images", "등장인물 갤러리", `${base}/gallery`],
          ["scenes", "file-text", "사건 분석", `${base}/scenes`],
        ]
      : [];
  const active = (key) =>
    key === page || (key === "gallery" && page === "analytics");
  const project =
    activity && !deep
      ? `<section class="lesson-context" aria-label="현재 수업">
    <div class="lesson-context-heading"><div><span class="eyebrow">${e(activity.course_name || "문학 수업")}</span><h2>${e(activity.title)}</h2><p>${e(activity.author)} · ${e(activity.class_name || "학급 미지정")} <span class="badge">${e(STAGES[activity.stage])}</span></p></div><div class="lesson-tools">${["detail", "edit"].includes(page) ? "" : `<a class="btn secondary small" href="${base}/settings">${icon("sliders-horizontal")} 수업 설정</a>`}${page === "finalize" ? "" : `<a class="btn primary small" href="${base}/finalize">${icon("check")} 수업 마무리</a>`}</div></div>
    <nav class="lesson-tabs" aria-label="수업 활동">${tabs.map(([key, ico, label, path], index) => `<a href="${path}" ${active(key) ? 'class="active" aria-current="page"' : ""}><span class="lesson-tab-number">0${index + 1}</span>${icon(ico)}<span>${label}</span></a>`).join("")}</nav>
  </section>`
      : "";
  root.classList.add("museum-classroom");
  root.innerHTML = `${museumHeader()}<div class="teacher-layout"><main id="main" class="teacher-main" data-page="${page}">${learningTabs(deep ? "deepening" : "understanding", activity)}${project}${content}</main></div>${museumFooter()}`;
}
export function pageHeading(
  eyebrow,
  title,
  description,
  actions = "",
  compact = false,
) {
  return `<div class="page-heading${compact ? " compact-heading" : ""}"><div>${eyebrow && !compact ? `<span class="eyebrow">${eyebrow}</span>` : ""}<h1${compact ? ' class="sr-only"' : ""}>${title}</h1>${description ? `<p>${description}</p>` : ""}</div>${actions ? `<div class="flex">${actions}</div>` : ""}</div>`;
}
function statistics(data) {
  const a = data.activity,
    w = data.worksheets,
    i = data.images;
  const portrait = new Set(
      i.filter((x) => x.image_type === "character").map((x) => x.worksheet_id),
    ).size,
    scene = new Set(
      i.filter((x) => x.image_type === "scene").map((x) => x.worksheet_id),
    ).size,
    complete = w.filter((x) => submissionProgress(i, x.id).complete).length;
  return (
    '<div class="dashboard-stats">' +
    [
      [
        "분석 완료 학생",
        w.length,
        "명",
        "예상 " +
          (a.expected_student_count || "미지정") +
          "명 · 완료 기록 기준",
      ],
      ["인물 사진 제출", portrait, "명", "성격과 본문 근거를 담은 사진"],
      ["사건 장면 제출", scene, "명", "인상 깊은 사건과 이유를 담은 사진"],
      [
        "두 사진 모두 제출",
        complete,
        "명",
        "전체 작품 " +
          i.length +
          "점 · 전시 승인 " +
          i.filter((x) => x.approval_status === "approved").length +
          "점",
      ],
    ]
      .map(
        ([label, value, unit, caption]) =>
          '<div class="stat"><div class="stat-label">' +
          label +
          '</div><div class="stat-value">' +
          value +
          "<small>" +
          unit +
          '</small></div><div class="stat-caption">' +
          caption +
          "</div></div>",
      )
      .join("") +
    "</div>"
  );
}
export async function teacherPage(root, path) {
  if (path === "/teacher/deepening/new") return deepeningEditor(root);
  if (path === "/teacher/activities/new") return activityEditor(root, null);
  if (path === "/teacher/settings") {
    if (!(await request("admin/session")).authenticated) return adminPage(root);
    return settingsPage(root);
  }
  if (path === "/teacher/activities") return navigate("/teacher", true);
  const parts = path.split("/");
  const id = parts[2] === "activity" ? parts[3] : null;
  if (id) {
    let data;
    try {
      data = await request("teacher/get", { id });
    } catch (error) {
      if (error.status === 401) return unlockPage(root, id, path);
      throw error;
    }
    if (parts[4] === "deepening") return deepeningTeacher(root, data);
    if (data.activity.lesson_kind === "deepening")
      return navigate(`/teacher/activity/${id}/deepening`, true);
    if (data.activity.finalized_at) return completedLesson(root, data);
    if (parts[4] === "finalize") return finalizePage(root, data);
    if (parts[4] === "showcase") return showcasePage(root, id);

    if (!parts[4]) return navigate(`/teacher/activity/${id}/background`, true);
    if (parts[4] === "background") return backgroundTeacher(root, data);
    if (parts[4] === "gallery") return galleryPage(root, data);
    if (parts[4] === "scenes") return galleryPage(root, data, "scene");
    if (parts[4] === "analytics") return analyticsPage(root, data);
    if (parts[4] === "live") return livePage(root, data);
    if (parts[4] === "settings") return activityDetail(root, data);
    if (parts[4] === "edit") return activityEditor(root, data.activity);
    throw new Error("수업 메뉴의 주소를 확인해 주세요.");
  }
  if (path !== "/teacher") throw new Error("교사 메뉴의 주소를 확인해 주세요.");
  forgetLessons();
  const tab =
    new URLSearchParams(currentRoute().split("?")[1] || "").get("tab") ||
    safeStorage("litverse-learning-tab") ||
    "understanding";
  return dashboard(
    root,
    await request("public/list"),
    tab === "deepening" ? "deepening" : "understanding",
  );
}
async function activityDetail(root, data) {
  const a = data.activity;
  teacherShell(
    root,
    "detail",
    a,
    `${pageHeading("CLASS SETTINGS", "수업 설정", "진행 단계를 바꾸고 참여 현황을 확인하세요.", button("수업 정보 수정", "sliders-horizontal", "secondary", 'id="edit-activity"'))}<section class="panel"><div class="between wrap"><div><span class="eyebrow" style="margin-bottom:10px">ACTIVITY STATUS</span><h2>${STAGES[a.stage]}</h2></div><div class="flex wrap">${customSelect({ name: "stage", label: "활동 진행 단계", value: a.stage, options: Object.entries(STAGES).map(([value, label]) => ({ value, label })) })}${button("단계 변경", "check", "primary", 'id="change-stage"')}</div></div><hr class="divider"/><p class="muted" style="font-size:13px">배경 탐구에서 시간적·공간적 배경을 질문하고 정리한 뒤, 인물·사건 분석과 두 사진 제출을 차례로 열어 주세요. 종료 후에는 학생의 작성과 제출이 잠깁니다.</p><div class="flex wrap" style="margin-top:23px">${button("학생 참여 QR", "qr-code", "secondary", 'id="class-qr"')}<a class="btn ghost" href="/teacher/activity/${a.id}/live">제출 현황 ${icon("arrow-up-right")}</a></div></section>${statistics(data)}<div class="form-grid"><section class="panel"><h3>활동 소개</h3><p class="muted" style="font-size:14px;margin-top:18px;white-space:pre-wrap">${e(a.introduction)}</p><hr class="divider"/><h3>수업 목표</h3><p class="muted" style="font-size:13px;margin-top:15px">${e(a.objectives || "등록된 수업 목표가 없습니다.")}</p>${a.standards ? `<p class="muted" style="font-size:12px;margin-top:15px">${e(a.standards)}</p>` : ""}</section><section class="panel"><h3>학생 활동 안내</h3><ol class="student-task-list" style="margin-bottom:0">${a.tasks.map((t) => `<li>${e(t)}</li>`).join("")}</ol></section></div><div class="between wrap" style="margin-top:28px"><p class="muted" style="font-size:12px">분석 기록과 이미지 정보는 JSON 파일로 보관할 수 있습니다.</p><div class="flex wrap">${button("데이터 내보내기", "download", "secondary", 'id="export-data"')}${button("활동 삭제", "trash-2", "danger", 'id="delete-activity"')}</div></div>`,
  );
  initSelects(root);
  root.querySelector("#edit-activity").onclick = () =>
    navigate(`/teacher/activity/${a.id}/edit`);
  root.querySelector("#change-stage").onclick = () => {
    const stage = root.querySelector("[name=stage]").value;
    if (stage === a.stage) {
      toast("이미 선택한 단계로 진행 중이에요.");
      return;
    }
    confirmDialog({
      title: `${STAGES[stage]} 단계로 변경할까요?`,
      message:
        stage === "CLOSED"
          ? "종료하면 학생의 새 분석과 이미지 제출이 차단됩니다. 다시 열려면 단계를 변경할 수 있어요."
          : "선택한 단계에 따라 학생이 이용할 수 있는 활동이 변경됩니다.",
      confirm: "단계 변경",
      onConfirm: async () => {
        await request("teacher/stage", { id: a.id, stage });
        await render();
      },
    });
  };
  root.querySelector("#class-qr").onclick = () => showQR(a);
  root.querySelector("#export-data").onclick = async (event) => {
    const trigger = event.currentTarget;
    trigger.disabled = true;
    try {
      const background = await request("teacher/background", { id: a.id });
      const clean = structuredClone(data);
      clean.activity = background.activity;
      clean.background_questions = background.questions;
      clean.background_responses = background.responses;
      clean.worksheets.forEach((w) => {
        delete w.submission_code;
        delete w.submission_code_hash;
      });
      delete clean.activity.worksheet_token;
      delete clean.activity.submission_token;
      delete clean.activity.worksheet_token_hash;
      delete clean.activity.submission_token_hash;
      clean.images.forEach((i) => delete i.image_url);
      downloadText(JSON.stringify(clean, null, 2), `LITVERSE-${a.title}.json`);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      trigger.disabled = false;
    }
  };
  root.querySelector("#delete-activity").onclick = () =>
    confirmDialog({
      title: "활동과 모든 제출물을 삭제할까요?",
      message: `「${a.title}」의 분석 ${data.worksheets.length}개와 이미지 ${data.images.length}개를 함께 삭제합니다. 되돌릴 수 없습니다.`,
      confirm: "활동 전체 삭제",
      danger: true,
      typed: a.title,
      onConfirm: async () => {
        await request("teacher/delete-activity", { id: a.id });
        await navigate("/teacher");
      },
    });
}
export async function showQR(
  activity,
  kind = activity.stage === "SUBMISSION" ? "submission" : "analysis",
  suffix = "",
) {
  if (activity.stage === "DRAFT" && activity.active_phase !== "deepening") {
    toast(
      "먼저 수업 설정에서 배경 탐구 또는 인물·사건 분석을 시작해 주세요.",
      "error",
    );
    return;
  }
  const links = await request("teacher/links", { id: activity.id });
  let currentKind = kind;
  let large = false;
  const display = async () => {
    const url = publicRouteUrl(
      `/${currentKind === "analysis" ? "activity" : "submit"}/${currentKind === "analysis" ? links.worksheet_token : links.submission_token}${currentKind === "analysis" ? suffix : ""}`,
    );
    const qr = await QRCode.toDataURL(url, {
      width: 600,
      margin: 2,
      color: { dark: "#111827", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
    const modal = openModal({
      title:
        currentKind === "analysis"
          ? suffix === "/deepening"
            ? "이해 심화하기 참여"
            : activity.stage === "BACKGROUND"
              ? "배경 질문에 응답하기"
              : "나의 두 해석 시작하기"
          : "두 사진 제출하기",
      eyebrow: `${activity.title} · ${currentKind === "analysis" ? "ANALYSIS" : "SUBMISSION"}`,
      wide: !large,
      className: large ? "qr-large" : "",
      body: `<div class="${large ? "" : "qr-grid"}"><div class="qr-paper"><img src="${qr}" alt="${currentKind === "analysis" ? "학생 활동지" : "이미지 제출"} 접속 QR 코드"/></div>${large ? "" : `<div class="qr-info"><h3>카메라로 QR을 읽어 주세요.</h3><p class="muted" style="font-size:13px">${currentKind === "analysis" ? "별도의 회원가입 없이 나만의 인물 해석을 시작할 수 있어요." : "분석 완료 후 받은 개인 제출 코드가 필요해요."}</p><div class="link-box">${e(url)}</div>${isDemo ? '<div class="notice">데모는 같은 브라우저에서만 연결됩니다. 실제 기기 간 수업은 실서비스 설정 후 이용해 주세요.</div>' : ""}${currentKind === "submission" && activity.stage !== "SUBMISSION" ? '<p class="step-error">현재는 이미지 제출이 닫혀 있습니다.</p>' : ""}</div>`}</div>`,
      footer: `${button("링크 복사", "copy", "secondary", 'id="copy-qr"')}<a class="btn secondary" href="${e(url)}">학생 화면 열기</a>${button(large ? "작게 보기" : "크게 보기", "maximize-2", "secondary", 'id="expand-qr"')}${button(currentKind === "analysis" ? "제출 QR 보기" : "활동지 QR 보기", "qr-code", "primary", 'id="toggle-qr"')}`,
    });
    modal.element.querySelector("#copy-qr").onclick = () => copyText(url);
    modal.element.querySelector("#expand-qr").onclick = () => {
      large = !large;
      display();
    };
    modal.element.querySelector("#toggle-qr").onclick = () => {
      currentKind = currentKind === "analysis" ? "submission" : "analysis";
      display();
    };
  };
  await display();
}
async function activityEditor(root, a) {
  let tasks = [...(a?.tasks || DEFAULT_TASKS)];
  teacherShell(
    root,
    a ? "edit" : "new",
    a,
    `${pageHeading("CREATE YOUR CLASS", a ? "수업 정보 수정" : "수업 만들기", "작품 정보와 수업 설정을 저장하면 배경 탐구·등장인물 갤러리·사건 분석을 시작할 수 있어요.")}<form id="activity-form" class="editor" novalidate><section class="panel editor-section"><h2>01. 작품과 학급 정보</h2><div class="form-grid">${field("작품 제목", "title", a?.title, { required: true, max: 120, placeholder: "예: 동백꽃" })}${field("작가", "author", a?.author, { required: true, max: 80, placeholder: "예: 김유정" })}${field("수업명", "course_name", a?.course_name, { max: 120, placeholder: "예: 문학의 다양한 시선" })}${field("학급명", "class_name", a?.class_name, { max: 80, placeholder: "예: 2학년 3반" })}<div class="full">${field("수업 소개", "introduction", a?.introduction, { area: true, required: true, max: 3000, placeholder: "학생들에게 작품과 활동을 소개해 주세요." })}</div>${field("예상 참여 인원", "expected_student_count", a?.expected_student_count || 30, { type: "number", hint: "실제 참여 인원과 구분해 표시합니다." })}<div class="field"><span>기본 이미지 스타일</span>${customSelect({ name: "default_image_style", label: "기본 이미지 스타일", value: a?.default_image_style || STYLES[0], options: STYLES })}</div></div></section>${synopsisPanel(a?.synopsis)}${!a ? `<section class="panel editor-section class-password-panel"><h2>이 수업의 비밀번호</h2><div class="form-grid">${field("수업 비밀번호", "password", "", { type: "password", required: true, max: 128, hint: "8자 이상. 이 비밀번호를 입력해야 수업을 이어갈 수 있습니다." })}${field("비밀번호 확인", "confirm_password", "", { type: "password", required: true, max: 128 })}</div></section>` : ""}<section class="panel editor-section"><h2>02. 수업 목표와 활동 안내</h2><div class="stack">${field("수업 목표", "objectives", a?.objectives, { area: true, max: 2000, placeholder: "예: 인물의 말과 행동을 근거로 성격을 해석하고 서로 다른 해석을 비교한다." })}${field("교과 성취기준", "standards", a?.standards, { max: 1000, hint: "공식 교육과정의 코드와 문구를 직접 입력해 주세요." })}<div class="field"><span>학생이 해야 할 일 <b class="required">*</b></span><div class="task-list" id="task-list"></div><div>${button("할 일 추가", "plus", "ghost", 'id="add-task"')}</div></div>${field("작품의 배경 정보", "background", a?.background, { area: true, max: 2000 })}${field("프롬프트에 덧붙일 표현 안내", "prompt_template", a?.prompt_template, { area: true, max: 2000, hint: "학생의 해석을 바꾸지 않는 공통 표현 안내를 작성해 주세요." })}</div></section><section class="panel editor-section"><h2>03. 수업에 맞는 설정</h2><div class="stack">${field("기본 성격 키워드", "tags", (a?.tags || DEFAULT_TAGS).join(", "), { area: true, hint: "쉼표로 구분해 주세요. 학생도 새로운 키워드를 추가할 수 있어요." })}<div class="notice">인물 사진 한 장과 사건 장면 사진 한 장을 각각 제출합니다. 두 분석과 두 프롬프트는 필수입니다.</div>${[
      ["allow_resubmit", "학생 이미지 재제출 허용", true],
      ["require_approval", "공개 전시 전 교사 승인 필요", true],
    ]
      .map(
        ([name, label, def]) =>
          `<label class="check-field"><input type="checkbox" name="${name}" ${(a?.settings[name] ?? def) ? "checked" : ""}/><span>${label}</span></label>`,
      )
      .join(
        "",
      )}</div></section><p class="step-error" role="alert" id="editor-error"></p><div class="form-actions"><a class="btn secondary" href="${a ? `/teacher/activity/${a.id}/settings` : "/teacher"}">취소</a><button type="submit" class="btn primary">${icon("check")}${a ? "변경 사항 저장" : "수업 만들기"}</button></div></form>`,
  );
  const form = root.querySelector("#activity-form");
  bindSynopsis(root, () => ({
    title: form.elements.title.value,
    author: form.elements.author.value,
  }));
  const list = root.querySelector("#task-list");
  const drawTasks = () => {
    list.innerHTML = tasks
      .map(
        (t, i) =>
          `<div class="task-item"><span class="task-index">${i + 1}</span><input data-task="${i}" aria-label="할 일 ${i + 1}" value="${e(t)}" maxlength="300"/><div class="task-controls"><button class="icon-btn" type="button" data-move="${i}" data-dir="-1" aria-label="할 일 ${i + 1} 위로" ${i === 0 ? "disabled" : ""}>${icon("move-up")}</button><button class="icon-btn" type="button" data-move="${i}" data-dir="1" aria-label="할 일 ${i + 1} 아래로" ${i === tasks.length - 1 ? "disabled" : ""}>${icon("move-down")}</button><button type="button" class="icon-btn" data-remove="${i}" aria-label="할 일 ${i + 1} 삭제">${icon("x")}</button></div></div>`,
      )
      .join("");
    refreshIcons();
  };
  drawTasks();
  list.oninput = (ev) => {
    if (ev.target.dataset.task !== undefined)
      tasks[Number(ev.target.dataset.task)] = ev.target.value;
  };
  list.onclick = (ev) => {
    const move = ev.target.closest("[data-move]");
    const remove = ev.target.closest("[data-remove]");
    if (move) {
      const i = Number(move.dataset.move),
        j = i + Number(move.dataset.dir);
      [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
      drawTasks();
      list.querySelector(`[data-task="${j}"]`).focus();
    }
    if (remove) {
      tasks.splice(Number(remove.dataset.remove), 1);
      drawTasks();
    }
  };
  root.querySelector("#add-task").onclick = () => {
    if (tasks.length >= 20) {
      toast("할 일은 최대 20개까지 등록할 수 있어요.", "error");
      return;
    }
    tasks.push("");
    drawTasks();
    list.querySelector("[data-task]:last-of-type")?.focus();
  };
  initSelects(root);
  refreshIcons();
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (formErrors(form)) return;
    const values = Object.fromEntries(new FormData(form));
    if (
      !a &&
      (values.password.length < 8 ||
        values.password !== values.confirm_password)
    ) {
      root.querySelector("#editor-error").textContent =
        "비밀번호를 8자 이상으로 입력하고 확인란에 동일하게 적어 주세요.";
      return;
    }
    const count = Number(values.expected_student_count);
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      root.querySelector("#editor-error").textContent =
        "예상 참여 인원은 1~1,000 사이의 정수로 입력해 주세요.";
      return;
    }
    const cleanedTasks = tasks.map((t) => t.trim()).filter(Boolean);
    if (!cleanedTasks.length) {
      root.querySelector("#editor-error").textContent =
        "학생이 해야 할 일을 하나 이상 작성해 주세요.";
      return;
    }
    const activity = {
      ...values,
      expected_student_count: count,
      tasks: cleanedTasks,
      tags: normalizeTags(values.tags, 50),
      settings: {
        allow_resubmit: form.elements.allow_resubmit.checked,
        require_approval: form.elements.require_approval.checked,
        enable_scene: true,
        max_images: 1,
      },
    };
    delete activity.password;
    delete activity.confirm_password;
    delete activity.max_images;
    delete activity.allow_resubmit;
    delete activity.require_approval;
    delete activity.enable_scene;
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const saved = await request("teacher/save", {
        id: a?.id,
        activity,
        ...(!a ? { password: values.password } : {}),
      });
      if (saved.access) rememberAccess(saved.id, saved.access);
      toast(
        a
          ? "수업 정보를 저장했어요."
          : "수업을 만들었어요. 배경 탐구부터 시작해 보세요.",
      );
      await navigate(
        `/teacher/activity/${saved.id}/${a ? "settings" : "background"}`,
      );
    } catch (error) {
      root.querySelector("#editor-error").textContent = error.message;
      btn.disabled = false;
    }
  };
}
async function livePage(root, data) {
  const id = data.activity.id;
  let stopped = false;
  let liveType = "character";
  teacherShell(
    root,
    "live",
    data.activity,
    `${pageHeading("LIVE CLASSROOM", `${e(data.activity.title)} · 모이는 시선`, "학생이 제출한 작품과 분석 완료 현황을 확인하세요.", `${button("제출 QR", "qr-code", "primary", 'id="live-qr"')}`)}<div class="between wrap"><span class="badge blue" id="connection-state">${isDemo ? "같은 브라우저의 데모 탭 연결" : "실시간 연결 중"}</span><span class="muted" style="font-size:11px">${isDemo ? "데모 예시 데이터" : "완료된 활동지 기준 · 실시간 동기화"}</span></div><div id="live-stats"></div><div class="work-tabs teacher-category-tabs" role="tablist" aria-label="취합할 사진 종류"><button role="tab" aria-selected="true" data-live-type="character">01 인물 사진</button><button role="tab" aria-selected="false" data-live-type="scene">02 사건 장면 사진</button></div><div class="live-grid"><div><div class="section-heading"><h2>도착한 작품</h2><a class="text-link" href="/teacher/activity/${id}/gallery">갤러리에서 관리 ${icon("arrow-up-right")}</a></div><div class="gallery-grid" id="live-art"></div></div><aside class="panel"><h3>분석 완료 학생</h3><p class="muted" style="font-size:11px;margin:12px 0 18px">예상 인원 ${data.activity.expected_student_count || "미지정"}명과 실제 완료 인원은 다릅니다. 작성 중 내용은 학생 기기에 임시저장됩니다.</p><div class="student-list" id="live-students"></div></aside></div>`,
  );
  const draw = () => {
    root.querySelector("#live-stats").innerHTML = statistics(data);
    root.querySelector("#live-art").innerHTML = data.images.length
      ? [...data.images]
          .filter((i) => i.image_type === liveType)
          .reverse()
          .map((i) => artCard(i, data.worksheets))
          .join("")
      : '<div class="empty" style="grid-column:1/-1">아직 제출된 이미지가 없어요.</div>';
    root.querySelector("#live-students").innerHTML =
      data.worksheets
        .map(
          (w) =>
            `<div class="student-row"><div>${e(w.student_label)}<small style="display:block;margin-top:5px">${e(w.character_name)} · 인물 ${submissionProgress(data.images, w.id).character ? "✓" : "미제출"} · 사건 ${submissionProgress(data.images, w.id).scene ? "✓" : "미제출"}</small></div><button class="icon-btn" data-student="${e(w.id)}" aria-label="${e(w.student_label)} 제출 관리">${icon("more-horizontal")}</button></div>`,
        )
        .join("") ||
      '<p class="muted" style="font-size:12px">완료한 학생이 아직 없어요.</p>';
    refreshIcons();
  };
  draw();
  const reload = async () => {
    const next = await request("teacher/get", { id });
    if (stopped) return;
    data = next;
    draw();
  };
  root.querySelectorAll("[data-live-type]").forEach(
    (btn) =>
      (btn.onclick = () => {
        liveType = btn.dataset.liveType;
        root
          .querySelectorAll("[data-live-type]")
          .forEach((b) => b.setAttribute("aria-selected", b === btn));
        draw();
      }),
  );
  root.querySelector("#live-qr").onclick = () =>
    showQR(data.activity, "submission");
  root.querySelector("#live-art").onclick = (ev) => {
    const key = ev.target.closest("[data-open-art]")?.dataset.openArt;
    if (key)
      showArt(
        data.images.find((i) => i.id === key),
        data,
        { onChange: reload },
      );
  };
  root.querySelector("#live-students").onclick = (ev) => {
    const key = ev.target.closest("[data-student]")?.dataset.student;
    if (!key) return;
    const w = data.worksheets.find((w) => w.id === key);
    const modal = openModal({
      title: `${w.student_label} · ${w.character_name}`,
      body: `<div class="detail-copy"><div><h4>인물 해석</h4><p>${e(w.personality_description)}</p></div><div><h4>작품 속 근거</h4><p>${e(w.textual_evidence)}</p></div></div>`,
      footer: `${button("제출 코드 재발급", "rotate-ccw", "secondary", 'id="reissue-code"')}${button("학생 기록 삭제", "trash-2", "danger", 'id="delete-student"')}`,
    });
    modal.element.querySelector("#reissue-code").onclick = () =>
      confirmDialog({
        title: "제출 코드를 재발급할까요?",
        message:
          "기존 코드는 더 이상 사용할 수 없습니다. 새 코드를 해당 학생에게 직접 전달해 주세요.",
        confirm: "재발급",
        onConfirm: async () => {
          const { code } = await request("teacher/reissue", {
            id,
            worksheet_id: w.id,
          });
          setTimeout(() => {
            const codeModal = openModal({
              title: "새 개인 제출 코드",
              body: `<p class="muted" style="font-size:13px">${e(w.student_label)}에게만 전달해 주세요.</p><div class="submission-code"><code>${e(code)}</code></div>`,
              footer: button(
                "코드 복사",
                "copy",
                "primary",
                'id="copy-reissued"',
              ),
            });
            codeModal.element.querySelector("#copy-reissued").onclick = () =>
              copyText(code);
          }, 0);
        },
      });
    modal.element.querySelector("#delete-student").onclick = () =>
      confirmDialog({
        title: "학생 기록 전체를 삭제할까요?",
        message: `${w.student_label}의 분석과 제출 이미지가 모두 삭제됩니다.`,
        danger: true,
        confirm: "기록 삭제",
        onConfirm: async () => {
          await request("teacher/delete-worksheet", { id, worksheet_id: w.id });
          await reload();
        },
      });
  };
  const unsub = subscribe(
    id,
    () => reload().catch((err) => toast(err.message, "error")),
    (state) => {
      if (!stopped) {
        const node = root.querySelector("#connection-state");
        if (node)
          node.textContent =
            state === "demo"
              ? "같은 브라우저의 데모 탭 연결"
              : state === "connected"
                ? "실시간 연결됨"
                : "연결 복구 중 · 주기적으로 동기화";
      }
    },
  );
  return () => {
    stopped = true;
    unsub();
  };
}
async function settingsPage(root) {
  const jobs = await request("teacher/jobs");
  teacherShell(
    root,
    "settings",
    null,
    `${pageHeading("WORKSPACE SETTINGS", "수업 공간 설정", "연결 상태와 데이터 정리를 확인합니다.")}<div class="editor stack"><section class="panel"><h3>현재 운영 모드</h3><div class="notice" style="margin-top:20px">${icon("info")}<span>${isDemo ? "데모 모드 · 이 브라우저의 저장소에만 기록됩니다. 현재 보이는 인물 분석과 일러스트레이션은 예시 자료입니다. 실제 학생의 개인 자료를 입력하지 마세요." : "실서비스 모드 · Supabase 인증, 비공개 이미지 저장소, 실시간 동기화를 사용합니다."}</span></div>${isDemo ? `<div style="margin-top:20px">${button("데모 자료 초기화", "rotate-ccw", "secondary", 'id="reset-demo"')}</div>` : ""}</section><section class="panel"><div class="between wrap"><h3>삭제·업로드 정리 작업</h3>${button("실패한 정리 다시 시도", "rotate-ccw", "secondary", 'id="retry-cleanup"')}</div><p class="muted" style="font-size:12px;margin-top:15px">파일 삭제와 데이터 정리가 중간에 실패하면 작업을 기록하고 다시 시도합니다.</p><div class="stack" style="margin-top:20px">${jobs.length ? jobs.map((j) => `<div class="student-row"><span>${e(j.target_type)} · ${e(j.status)}</span><small>${e(j.error_message || "정리 대기")}</small></div>`).join("") : '<span class="muted" style="font-size:13px">남아 있는 정리 작업이 없습니다.</span>'}</div></section><section class="panel"><h3>학생과 연결하기</h3><p class="muted" style="font-size:13px;margin-top:15px">교사는 노트북·데스크톱에서, 학생은 선생님이 공개한 활동 QR을 통해 모바일로 이용합니다. 실제 수업은 HTTPS 배포 주소와 Supabase 설정을 완료한 뒤 진행해 주세요.</p></section></div>`,
  );
  root.querySelector("#reset-demo")?.addEventListener("click", () =>
    confirmDialog({
      title: "데모 자료를 초기화할까요?",
      message:
        "이 브라우저에서 수정한 데모 활동과 업로드 이미지를 지우고 최초 예시 자료로 돌아갑니다.",
      danger: true,
      confirm: "초기화",
      onConfirm: async () => {
        await request("demo/reset");
        await render();
      },
    }),
  );
  root.querySelector("#retry-cleanup").onclick = async (ev) => {
    ev.currentTarget.disabled = true;
    try {
      await request("teacher/retry-cleanup");
      toast("정리 작업을 다시 실행했어요.");
      await render();
    } catch (error) {
      toast(error.message, "error");
      ev.target.closest("button").disabled = false;
    }
  };
}
