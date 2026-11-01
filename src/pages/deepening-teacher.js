import { teacherShell, pageHeading, showQR } from "./teacher.js";
import { request, subscribe, isDemo } from "../services/api.js";
import { e, safeStorage, randomCode, downloadText } from "../utils/helpers.js";
import {
  field,
  button,
  icon,
  customSelect,
  initSelects,
  refreshIcons,
  formErrors,
  toast,
  openModal,
  confirmDialog,
  copyText,
} from "../components/ui.js";
import {
  analysisForm,
  readAnalysis,
  analysisSummary,
  perspectiveCards,
  recordDetail,
} from "../components/deepening.js";
import {
  reviewedSchema,
  manualAnalysis,
  startingQuestions,
  commonQuestions,
  GENRES,
  progressLabel,
} from "../utils/deepening.js";
import { rememberAccess } from "../services/access.js";
import { navigate } from "../main.js";
import { STAGES } from "../utils/domain.js";

function temporaryPassword(key, value) {
  try {
    const name = `litverse-deep-password:${key}`;
    if (value === undefined) return sessionStorage.getItem(name);
    if (value === null) sessionStorage.removeItem(name);
    else sessionStorage.setItem(name, value);
  } catch {
    /* The visible password can still be copied when storage is unavailable. */
  }
}

export async function deepeningEditor(
  root,
  linked = null,
  previous = null,
  newRound = false,
) {
  const activity = linked?.activity;
  const key = `litverse-deep-teacher:${activity?.id || "new"}:${newRound ? "round" : "draft"}`;
  let saved = safeStorage(key) || {},
    stopped = false,
    busy = false;
  let input =
    saved.input ||
    (previous?.work
      ? {
          title: previous.work.title,
          author: previous.work.author,
          edition: previous.work.edition,
          source_text: previous.work.source_text,
        }
      : {
          title: activity?.title || "",
          author: activity?.author || "",
          edition: "",
          source_text: activity?.synopsis || "",
        });
  let result =
    saved.result ||
    (previous?.work
      ? {
          analysis: previous.work.reviewed_analysis,
          original: previous.work.ai_draft,
          source: previous.work.analysis_source,
          note: "이전 분석을 새 버전으로 저장합니다.",
        }
      : null);
  const activityId = saved.activityId || activity?.id || crypto.randomUUID();
  const requestId = saved.requestId || crypto.randomUUID();
  const password = temporaryPassword(key) || randomCode().slice(0, 16);
  temporaryPassword(key, password);
  const persist = () =>
    safeStorage(key, { input, result, activityId, requestId });
  function draw() {
    teacherShell(
      root,
      "deepening-editor",
      null,
      `${pageHeading("READ DEEPER", activity ? `${e(activity.title)} · 이해 심화하기` : "새로운 심화 수업", activity ? "작품 파악 기록과 같은 수업에 연결됩니다. 기존 기록은 그대로 남습니다." : "작품명과 작가로 시작하세요. 분석은 검토한 뒤 수업으로 확정합니다.")}<div class="deep-editor"><form id="deep-input" class="panel" novalidate><div class="form-grid">${field("문학 작품명", "title", input.title, { required: true, max: 120 })}${field("작가명", "author", input.author, { required: true, max: 80 })}</div><details ${result && !result.analysis.identified ? "open" : ""}><summary>수록본·줄거리·핵심 지문 추가</summary>${field("교과서 또는 수록본", "edition", input.edition, { max: 160 })}${field("줄거리 또는 핵심 지문", "source_text", input.source_text, { area: true, max: 12000, hint: "작품을 식별하기 어렵거나 일부 지문을 다루는 경우 입력해 주세요." })}</details><p class="step-error" role="alert"></p><div class="flex wrap"><button type="submit" class="btn primary">${icon("sparkles")} 작품 분석하기</button>${button("분석 직접 작성", "pencil", "secondary", 'type="button" id="manual-analysis"')}</div><p class="student-note">${isDemo ? "데모에서는 내장 예시를 사용합니다. 실제 AI 호출은 운영 서버 연결 후 가능합니다." : "원문과 대조해 검토할 초안입니다. 작품 정보가 불확실하면 추가 지문을 요청합니다."}</p></form>${activity ? `<details class="panel"><summary>연결된 작품 파악 기록</summary><p>${e(activity.author)} · ${e(activity.class_name)} · ${e(STAGES[activity.stage])}</p><p>기존 분석 ${linked.worksheets.length}명 · 이미지 ${linked.images.length}장</p><p>${e(activity.temporal_background || "")}</p><p>${e(activity.spatial_background || "")}</p><p>수업 ID와 참여 링크, 개인 제출 코드가 유지됩니다.</p></details>` : ""}<section id="deep-analysis-preview"></section></div>`,
    );
    const form = root.querySelector("#deep-input");
    const collect = () => {
      input = {
        title: form.elements.title.value.trim(),
        author: form.elements.author.value.trim(),
        edition: form.elements.edition.value.trim(),
        source_text: form.elements.source_text.value,
      };
      persist();
    };
    form.oninput = collect;
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (busy || formErrors(form)) return;
      collect();
      busy = true;
      const trigger = form.querySelector('[type="submit"]');
      trigger.disabled = true;
      trigger.textContent = "작품을 살펴보고 있어요…";
      try {
        const requested = JSON.stringify(input);
        const next = await request("deepening/analyze", {
          ...input,
          ...(activity ? { id: activity.id } : {}),
        });
        if (stopped) return;
        collect();
        if (requested !== JSON.stringify(input)) {
          toast("작품 정보가 바뀌었습니다. 현재 정보로 다시 분석해 주세요.");
          return;
        }
        result = {
          ...next,
          original: structuredClone(next.analysis),
          input_snapshot: JSON.stringify(input),
        };
        persist();
        preview();
      } catch (error) {
        if (!stopped)
          form.querySelector(".step-error").textContent = error.message;
      } finally {
        busy = false;
        if (!stopped) {
          trigger.disabled = false;
          trigger.innerHTML = `${icon("sparkles")} 작품 분석하기`;
          refreshIcons();
        }
      }
    };
    root.querySelector("#manual-analysis").onclick = () => {
      if (formErrors(form)) return;
      collect();
      result = {
        analysis: manualAnalysis(input),
        source: "manual",
        note: "교사가 원문을 바탕으로 작성하는 수업입니다.",
      };
      persist();
      preview();
    };
    if (result) preview();
    initSelects(root);
    refreshIcons();
  }
  function preview() {
    const area = root.querySelector("#deep-analysis-preview");
    area.innerHTML = `<form id="deep-review" class="panel" novalidate><div class="between wrap"><div><span class="eyebrow">TEACHER REVIEW</span><h2>분석 미리보기 · 수정</h2></div><span class="badge">${result.source === "ai" ? "AI 초안" : result.source === "example" ? "내장 예시" : "직접 작성"}</span></div><div class="notice">${e(result.note)}<br/>${e(result.analysis.uncertainty)}</div>${analysisForm(result.analysis)}${button("갈래에 맞는 질문 틀 적용", "refresh-cw", "ghost", 'type="button" id="genre-questions"')}<label class="deep-review-check"><input type="checkbox" name="reviewed" required/> 작품 정보·갈래·질문을 원문과 대조해 확인했습니다.</label>${!activity ? `<details class="deep-password"><summary>이 수업의 비밀번호 확인</summary><p>자동으로 만든 비밀번호입니다. 수업을 다시 열 때 필요하므로 따로 보관해 주세요.</p><code>${e(password)}</code>${button("비밀번호 복사", "copy", "secondary small", 'type="button" id="copy-deep-password"')}</details>` : ""}<p class="step-error" role="alert"></p><div class="flex wrap"><button type="submit" class="btn primary">${icon("check")} ${newRound ? "새 회차로 보관하기" : "이 분석으로 수업 만들기"}</button><a class="btn ghost" href="${activity ? `/teacher/activity/${e(activity.id)}/deepening` : "/teacher?tab=deepening"}">취소</a></div></form>`;
    const form = area.querySelector("form");
    const remember = () => {
      result.analysis = readAnalysis(form, result.analysis);
      persist();
    };
    form.oninput = remember;
    form.onchange = remember;
    form
      .querySelector("#copy-deep-password")
      ?.addEventListener("click", () => copyText(password));
    form.querySelector("#genre-questions").onclick = () => {
      const genre = form.elements.genre.value;
      form.elements.opening_question.value = startingQuestions[genre];
      const questions = commonQuestions(genre);
      Object.keys(questions).forEach(
        (k) => (form.elements[`common_${k}`].value = questions[k]),
      );
      remember();
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (busy || formErrors(form)) return;
      busy = true;
      const trigger = form.querySelector('[type="submit"]');
      trigger.disabled = true;
      try {
        if (!form.elements.reviewed.checked)
          throw new Error("원문과 대조한 뒤 확인란을 선택해 주세요.");
        if (
          result.input_snapshot &&
          result.input_snapshot !== JSON.stringify(input)
        )
          throw new Error(
            "작품 정보가 바뀌었습니다. 현재 정보로 다시 분석해 주세요.",
          );
        const analysis = reviewedSchema.parse(
          readAnalysis(form, result.analysis),
        );
        const response = await request("deepening/save", {
          ...(activity
            ? { id: activity.id }
            : { activity_id: activityId, password }),
          request_id: requestId,
          input,
          analysis,
          draft: result.original || result.analysis,
          source: result.source,
          new_round: newRound,
        });
        if (response.access) rememberAccess(response.id, response.access);
        safeStorage(key, null);
        if (!activity) temporaryPassword(response.id, password);
        temporaryPassword(key, null);
        if (!stopped)
          await navigate(`/teacher/activity/${response.id}/deepening`);
      } catch (error) {
        if (!stopped)
          form.querySelector(".step-error").textContent =
            error.name === "ZodError"
              ? "모든 분석 항목과 서로 다른 선택지·질문을 구체적으로 작성해 주세요."
              : error.message;
      } finally {
        busy = false;
        trigger.disabled = false;
      }
    };
    initSelects(area);
    refreshIcons();
  }
  draw();
  return () => {
    stopped = true;
  };
}

export async function deepeningTeacher(root, linked) {
  const a = linked.activity;
  let data = await request("deepening/get", { id: a.id }),
    stopped = false,
    busy = false;
  if (!data.session) return deepeningEditor(root, linked);
  let selected = data.session.id,
    connection = "진행 현황 연결 중";
  const controls = async (values) => {
    if (busy) return;
    busy = true;
    try {
      await request("deepening/control", {
        id: a.id,
        session_id: selected,
        status: data.session.status,
        visibility: data.session.visibility,
        phase: a.active_phase || "understanding",
        ...values,
      });
      Object.assign(a, { active_phase: values.phase || a.active_phase });
      await reload(true);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      busy = false;
    }
  };
  function records() {
    const list = root.querySelector("#deep-students");
    if (!list) return;
    root.querySelector("#deep-progress").textContent =
      `참여 ${data.records.length}명 · 최초 판단 ${data.records.filter((r) => r.initial).length}명 · 세 답변 ${data.records.filter((r) => r.answers_submitted_at).length}명 · 성찰 완료 ${data.records.filter((r) => r.completed_at).length}명`;
    list.innerHTML = data.records.length
      ? perspectiveCards(data.records, true)
      : '<div class="empty">학생들이 참여하면 진행 현황이 여기에 나타납니다.</div>';
    list.onclick = (event) => {
      const id = event.target.closest("[data-record]")?.dataset.record;
      const r = data.records.find((r) => r.id === id);
      if (r)
        openModal({
          title: `${r.student_label} · ${progressLabel(r)}`,
          body: recordDetail(r),
          wide: true,
        });
    };
    refreshIcons();
  }
  async function reload(redraw = false) {
    const next = await request("deepening/get", {
      id: a.id,
      session_id: selected,
    });
    if (stopped) return;
    const changed =
      JSON.stringify(next.session) !== JSON.stringify(data.session);
    data = next;
    if (redraw || changed) draw();
    else records();
  }
  function draw() {
    const s = data.session,
      analysis = data.work.reviewed_analysis,
      password = temporaryPassword(a.id);
    teacherShell(
      root,
      "deepening",
      a,
      `${pageHeading("DEEPER READING", "이해 심화하기", `${e(a.title)} · ${e(a.author)} · ${s.round}회차 · 분석 버전 ${data.work.version}`)}<section class="panel deep-control"><div class="between wrap"><div><span class="badge ${s.status === "OPEN" ? "blue" : ""}">${{ DRAFT: "준비 중", OPEN: "심화 진행 중", CLOSED: "심화 종료" }[s.status]}</span><p>${a.lesson_kind === "deepening" ? "독립 심화 수업" : `작품 파악: ${e(STAGES[a.stage])}`} · 학생에게 안내 중: ${a.active_phase === "deepening" ? "이해 심화하기" : "작품 파악하기"}</p></div><div class="flex wrap">${s.status !== "OPEN" ? button(s.status === "CLOSED" ? "심화 활동 다시 열기" : "심화 활동 시작", "play", "primary", 'id="deep-start"') : button("심화 활동 종료", "pause", "secondary", 'id="deep-close"')}${s.status !== "DRAFT" ? button("학생 참여 QR", "qr-code", "secondary", 'id="deep-qr"') : ""}${a.lesson_kind !== "deepening" && s.status === "OPEN" ? button(a.active_phase === "deepening" ? "학생에게 작품 파악 안내" : "학생에게 심화 활동 안내", "arrow-left-right", "ghost", 'id="deep-phase"') : ""}</div></div>${password ? `<details class="deep-password"><summary>이 수업의 비밀번호</summary><code>${e(password)}</code>${button("비밀번호 복사", "copy", "secondary small", 'id="copy-deep-password"')}<p>수업을 다시 열 때 필요합니다. 따로 보관한 뒤 ${button("이 기기에서 숨기기", "eye-off", "ghost small", 'id="hide-deep-password"')}</p></details>` : ""}<div class="deep-options">${customSelect({ name: "deep_round", label: "활동 회차", value: selected, options: data.sessions.map((s) => ({ value: s.id, label: `${s.round}회차${s.status === "CLOSED" ? " · 종료" : ""}` })) })}${customSelect(
        {
          name: "deep_visibility",
          label: "결과 공개 범위",
          value: s.visibility,
          options: [
            { value: "private", label: "교사만 보기" },
            { value: "class", label: "같은 수업에서 감상" },
            { value: "public", label: "문학 전시관에 공개" },
          ],
        },
      )}${button("공개 범위 적용", "check", "secondary", 'id="deep-publish"')}</div><p class="student-note">수업 내 감상은 세 답변을 제출한 학생에게 열립니다. 전시관에는 성찰을 완료한 기록만 익명의 ‘관점’ 이름으로 표시됩니다.</p></section>${analysisSummary(analysis)}<div class="flex wrap deep-secondary-actions">${s.status === "DRAFT" ? button("분석 수정", "pencil", "secondary", 'id="deep-edit"') : ""}${s.status !== "OPEN" ? button("새 회차 만들기", "plus", "secondary", 'id="deep-new-round"') : ""}${button("활동 기록 내려받기", "download", "ghost", 'id="deep-export"')}</div><section class="deep-class-progress"><div class="between wrap"><h2>우리 반의 생각</h2><span id="deep-connection" class="muted">${e(connection)}</span></div><p id="deep-progress" role="status"></p><div id="deep-students"></div></section>`,
    );
    root
      .querySelector("#deep-start")
      ?.addEventListener("click", () =>
        controls({ status: "OPEN", phase: "deepening" }),
      );
    root.querySelector("#deep-close")?.addEventListener("click", () =>
      controls({
        status: "CLOSED",
        phase: a.lesson_kind === "deepening" ? "deepening" : "understanding",
      }),
    );
    root.querySelector("#deep-phase")?.addEventListener("click", () =>
      controls({
        phase: a.active_phase === "deepening" ? "understanding" : "deepening",
      }),
    );
    root
      .querySelector("#deep-qr")
      ?.addEventListener("click", () => showQR(a, "analysis", "/deepening"));
    root
      .querySelector("#copy-deep-password")
      ?.addEventListener("click", () => copyText(password));
    root.querySelector("#hide-deep-password")?.addEventListener("click", () => {
      temporaryPassword(a.id, null);
      draw();
    });
    root.querySelector("[name=deep_round]").onchange = async (event) => {
      selected = event.target.value;
      await reload(true);
    };
    root.querySelector("#deep-publish").onclick = () => {
      const visibility = root.querySelector("[name=deep_visibility]").value;
      if (visibility === "public")
        confirmDialog({
          title: "완료한 성찰을 전시관에 공개할까요?",
          message:
            "완료된 글을 먼저 읽고 실명·연락처가 없는지 확인해 주세요. 공개된 글은 참여 링크 없이도 누구나 관람할 수 있습니다.",
          confirm: "전시관에 공개",
          onConfirm: () => controls({ visibility }),
        });
      else controls({ visibility });
    };
    root.querySelector("#deep-edit")?.addEventListener("click", async () => {
      dispose();
      editorCleanup = await deepeningEditor(root, linked, data);
    });
    root
      .querySelector("#deep-new-round")
      ?.addEventListener("click", async () => {
        dispose();
        editorCleanup = await deepeningEditor(root, linked, data, true);
      });
    root.querySelector("#deep-export").onclick = () =>
      downloadText(
        JSON.stringify(
          {
            title: a.title,
            author: a.author,
            session: data.session,
            work: data.work,
            records: data.records,
          },
          null,
          2,
        ),
        `LITVERSE-${a.title}-심화-${s.round}회차.json`,
      );
    initSelects(root);
    records();
  }
  draw();
  let editorCleanup;
  const unsub = subscribe(
    a.id,
    () => reload().catch(() => {}),
    (state) => {
      const node = root.querySelector("#deep-connection");
      connection =
        state === "demo"
          ? "같은 브라우저의 탭에서 갱신"
          : state === "connected"
            ? "실시간 연결됨"
            : "연결 확인 중";
      if (node) node.textContent = connection;
    },
  );
  const timer = setInterval(() => reload().catch(() => {}), 15000);
  const dispose = () => {
    stopped = true;
    unsub();
    clearInterval(timer);
  };
  return () => {
    dispose();
    editorCleanup?.();
  };
}
