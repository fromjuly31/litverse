import { request, subscribe } from "../services/api.js";
import { studentShell } from "../components/student-ui.js";
import {
  button,
  field,
  icon,
  toast,
  formErrors,
  refreshIcons,
  openModal,
  copyText,
} from "../components/ui.js";
import { e, safeStorage, randomCode, downloadText } from "../utils/helpers.js";
import { PURPOSES, REFLECTIONS } from "../utils/deepening.js";
import {
  analysisSummary,
  recordDetail,
  perspectiveCards,
  reflectionMarkup,
} from "../components/deepening.js";

export async function deepeningStudent(root, activity, token) {
  const previousWork = safeStorage(`litverse-draft:${token}`);
  let code =
    safeStorage(`litverse-code:${activity.id}`) ||
    previousWork?.code ||
    randomCode();
  let label =
    safeStorage(`litverse-label:${activity.id}`) ||
    previousWork?.worksheet?.student_label ||
    "";
  safeStorage(`litverse-code:${activity.id}`, code);
  let data = await request("deepening/student-get", { token, code }),
    stopped = false,
    busy = false,
    saveTimer,
    saving = Promise.resolve(),
    dirty = new Set();
  const sessionId = data.session.id;
  let key = `litverse-deep-draft:${sessionId}:${code}`,
    draft = safeStorage(key) || {},
    step = 1;
  const payload = () => ({ token, code, session_id: sessionId });
  const persist = () => {
    const ok = safeStorage(key, draft);
    const status = root.querySelector("#deep-save-state");
    if (status)
      status.textContent = ok
        ? "이 기기에 임시저장됨"
        : "기기 저장 실패 · 내용을 복사해 주세요";
    return ok;
  };
  const updateRecord = (record) => {
    data.record = record;
    draft.base_revision = record.revision;
    safeStorage(key, draft);
  };
  async function write(operation, values) {
    const record = await request("deepening/student-write", {
      ...payload(),
      operation,
      data: values,
      revision: data.record.revision,
    });
    updateRecord(record);
    return record;
  }
  function saveAnswer(purpose) {
    // Serialize writes so each answer uses the last acknowledged revision.
    saving = saving
      .catch(() => {})
      .then(async () => {
        const answer = draft.answers?.[purpose];
        if (
          answer === undefined ||
          !dirty.has(purpose) ||
          data.record?.completed_at ||
          data.session.status !== "OPEN"
        )
          return;
        await write("answer", { purpose, answer });
        if (draft.answers[purpose] === answer) dirty.delete(purpose);
        const status = root.querySelector("#deep-save-state");
        if (!stopped && status)
          status.textContent = dirty.size ? "저장 중…" : "수업에 저장됨";
      });
    saving.catch((error) => {
      if (!stopped) {
        const status = root.querySelector("#deep-save-state");
        if (status) status.textContent = "연결 확인 필요 · 임시저장 유지";
      }
    });
    return saving;
  }
  async function flush() {
    clearTimeout(saveTimer);
    for (const purpose of [...dirty]) saveAnswer(purpose);
    await saving;
    if (dirty.size)
      throw new Error(
        "아직 수업에 저장되지 않은 답변이 있습니다. 연결을 확인하고 다시 저장해 주세요. 이 기기의 초안은 유지됩니다.",
      );
  }
  function chooseStep() {
    const r = data.record;
    step = r?.completed_at
      ? 5
      : r?.peer_viewed_at
        ? 4
        : r?.answers_submitted_at
          ? 3
          : r?.initial
            ? 2
            : 1;
  }
  function frame(content) {
    const done = data.record?.completed_at,
      closed = data.session.status !== "OPEN";
    studentShell(
      root,
      { ...activity, student_phase: "deepening" },
      `<div class="student-container deep-student"><div class="deep-student-heading"><span class="eyebrow">READ · QUESTION · REFLECT</span><h1 class="step-title">${e(data.title)}<small>이해 심화하기 · ${data.session.round}회차</small></h1><span class="saving" id="deep-save-state" role="status">작성 내용은 이 기기에 임시저장됩니다.</span></div><ol class="deep-steps" aria-label="심화 활동 진행률">${["최초 판단", "심화 질문", "다른 관점", "최종 성찰"].map((title, index) => `<li ${step === index + 1 ? 'aria-current="step"' : ""} class="${step > index + 1 ? "done" : ""}"><span>${step > index + 1 ? icon("check") : index + 1}</span>${title}</li>`).join("")}</ol><progress value="${done ? 4 : Math.max(0, step - 1)}" max="4" aria-label="완료한 심화 활동 단계"></progress>${closed ? '<div class="notice">심화 활동이 종료되어 기록을 읽을 수 있습니다. 작성하던 글은 임시저장으로 남습니다.</div>' : ""}${content}<p class="step-error" id="deep-error" role="alert"></p>${activity.lesson_kind !== "deepening" ? `<a class="text-link deep-return" href="/activity/${e(token)}/understanding">${icon("arrow-left")} 작품 파악 기록으로</a>` : ""}</div>`,
    );
    refreshIcons();
  }
  const run = async (event, task) => {
    event?.preventDefault();
    if (busy) return;
    busy = true;
    const trigger = event?.submitter || event?.currentTarget;
    if (trigger?.tagName === "BUTTON") trigger.disabled = true;
    try {
      await flush();
      await task();
    } catch (error) {
      if (!stopped)
        root.querySelector("#deep-error").textContent = error.message;
    } finally {
      busy = false;
      if (trigger?.tagName === "BUTTON") trigger.disabled = false;
    }
  };
  function join() {
    frame(
      `${analysisSummary(data.analysis)}<form id="deep-join" novalidate>${field("학생 번호 또는 별칭", "student_label", label, { required: true, max: 40, hint: "실명·연락처 없이 선생님이 안내한 번호나 별칭을 사용하세요." })}<button class="btn primary" type="submit" ${data.session.status !== "OPEN" ? "disabled" : ""}>심화 활동 참여하기 ${icon("arrow-right")}</button></form><details><summary>다른 기기에서 작성한 기록 불러오기</summary><form id="deep-restore" novalidate>${field("개인 제출 코드", "code", "", { required: true, max: 100 })}<button class="btn secondary" type="submit">기록 불러오기</button></form></details>`,
    );
    root.querySelector("#deep-join").onsubmit = (event) =>
      run(event, async () => {
        const form = event.target;
        if (formErrors(form)) return;
        label = form.elements.student_label.value.trim();
        safeStorage(`litverse-label:${activity.id}`, label);
        data = await request("deepening/student-join", {
          ...payload(),
          student_label: label,
        });
        chooseStep();
        draw();
      });
    root.querySelector("#deep-restore").onsubmit = (event) =>
      run(event, async () => {
        const restoredCode = event.target.elements.code.value.trim();
        const next = await request("deepening/student-get", {
          token,
          session_id: sessionId,
          code: restoredCode,
        });
        if (!next.record)
          throw new Error("이 회차에서 참여한 기록이 없는 코드입니다.");
        code = restoredCode;
        data = next;
        safeStorage(`litverse-code:${activity.id}`, code);
        key = `litverse-deep-draft:${sessionId}:${code}`;
        draft = safeStorage(key) || {};
        chooseStep();
        draw();
      });
  }
  function initial() {
    const a = data.analysis,
      values = data.record.initial || draft.initial || {};
    frame(
      `${analysisSummary(a)}<form id="deep-initial" novalidate><fieldset class="deep-choices"><legend>나의 선택 또는 해석</legend>${a.options.map((option, index) => `<label><input type="radio" name="suggestion" value="${e(option)}" ${values.choice === option ? "checked" : ""}/><span>${index + 1}. ${e(option)}</span></label>`).join("")}<label><input type="radio" name="suggestion" value="custom" ${values.choice && !a.options.includes(values.choice) ? "checked" : ""}/><span>나만의 다른 선택·해석</span></label></fieldset>${field("나의 선택", "choice", values.choice || "", { required: true, max: 500 })}${field("선택한 이유", "reason", values.reason || "", { area: true, required: true, max: 4000 })}${field("작품 속 판단 근거", "evidence", values.evidence || "", { area: true, required: true, max: 4000, hint: "작품의 어떤 내용이 판단에 영향을 주었나요?" })}<p class="student-note">최초 판단은 최종 성찰과 비교할 수 있도록 보존됩니다. 제출 이후에는 원래 생각을 바꾸어 덮어쓰지 않습니다.</p><button class="btn primary" type="submit" ${data.session.status !== "OPEN" ? "disabled" : ""}>최초 판단 제출하고 질문 받기 ${icon("arrow-right")}</button></form>`,
    );
    const form = root.querySelector("form");
    form.oninput = (event) => {
      if (event.target.name === "suggestion" && event.target.value !== "custom")
        form.elements.choice.value = event.target.value;
      draft.initial = {
        choice: form.elements.choice.value,
        reason: form.elements.reason.value,
        evidence: form.elements.evidence.value,
      };
      persist();
    };
    form.onsubmit = (event) =>
      run(event, async () => {
        if (formErrors(form)) return;
        const values = {
          choice: form.elements.choice.value,
          reason: form.elements.reason.value,
          evidence: form.elements.evidence.value,
        };
        await write("initial", values);
        step = 2;
        draw();
        await generateQuestions();
      });
  }
  async function generateQuestions() {
    const state = root.querySelector("#questions-state");
    if (state) state.textContent = "내 판단에서 다음 질문을 준비하고 있어요…";
    const record = await request("deepening/student-questions", payload());
    if (stopped) return;
    updateRecord(record);
    questions();
  }
  function questions() {
    const r = data.record;
    if (!r.questions) {
      frame(
        `<h2>나의 판단에서, 더 깊은 질문으로.</h2><p id="questions-state">최초 판단은 저장되었습니다. 아래 버튼으로 질문을 이어서 준비하세요.</p>${button("심화 질문 준비하기", "sparkles", "primary", 'id="prepare-questions"')}`,
      );
      root.querySelector("#prepare-questions").onclick = (event) =>
        run(event, generateQuestions);
      return;
    }
    draft.answers = { ...r.answers, ...draft.answers };
    for (const purpose of Object.keys(PURPOSES))
      if (
        draft.answers[purpose] !== (r.answers[purpose] || "") &&
        draft.answers[purpose] !== undefined
      )
        dirty.add(purpose);
    frame(
      `<p class="step-hint">${r.question_source === "ai" ? "나의 최초 판단을 바탕으로 만든 AI 질문입니다." : "교사가 검토한 질문에 나의 선택과 근거를 연결했습니다."} 정답을 찾기보다 근거를 더해 생각을 넓혀 보세요.</p><details class="deep-initial-review"><summary>나의 최초 판단 보기</summary><p>${e(r.initial.choice)}</p><p>${e(r.initial.reason)}</p><p>${e(r.initial.evidence)}</p></details><form id="deep-answers" novalidate>${Object.entries(
        PURPOSES,
      )
        .map(
          ([purpose, title], i) =>
            `<section class="deep-question-card"><span class="eyebrow">QUESTION ${i + 1} · ${title}</span><h2>${e(r.questions[purpose])}</h2>${field(`${title} 답변`, purpose, draft.answers[purpose] || "", { area: true, required: true, max: 5000, hint: "작품 속 근거와 자신의 생각을 연결해 5자 이상 적어 주세요." })}<button type="button" class="btn ghost small" data-save-answer="${purpose}" ${data.session.status !== "OPEN" ? "disabled" : ""}>이 답변 저장</button></section>`,
        )
        .join(
          "",
        )}<div class="student-bottom">${button("임시저장 글 내려받기", "download", "ghost", 'type="button" id="download-draft"')}<button class="btn primary" type="submit" ${data.session.status !== "OPEN" ? "disabled" : ""}>세 답변 제출 · 다른 관점으로 ${icon("arrow-right")}</button></div></form>`,
    );
    const form = root.querySelector("#deep-answers");
    form.oninput = (event) => {
      const purpose = event.target.name;
      if (!Object.hasOwn(PURPOSES, purpose)) return;
      draft.answers[purpose] = event.target.value;
      dirty.add(purpose);
      persist();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        for (const key of [...dirty]) saveAnswer(key);
      }, 900);
    };
    root
      .querySelectorAll("[data-save-answer]")
      .forEach(
        (btn) =>
          (btn.onclick = (event) =>
            run(event, () => saveAnswer(btn.dataset.saveAnswer))),
      );
    root.querySelector("#download-draft").onclick = () =>
      downloadText(
        JSON.stringify(draft, null, 2),
        `LITVERSE-심화-임시저장.json`,
      );
    form.onsubmit = (event) =>
      run(event, async () => {
        if (formErrors(form)) return;
        await write("submit-answers", {});
        step = 3;
        await peers();
      });
  }
  async function peers() {
    const visible = data.session.visibility !== "private";
    frame(
      `<h2>같은 작품, 다른 시선.</h2><p class="step-hint">나와 다른 관점, 새롭게 발견한 근거를 살펴보세요.<br/>내 생각을 다시 검토할 필요가 있는지도 생각해 보세요.</p><div id="deep-peers">${visible ? '<p class="muted">관점을 불러오고 있어요.</p>' : '<div class="notice">세 답변을 저장했습니다. 선생님이 감상을 열면 같은 수업의 다른 관점을 볼 수 있어요.</div>'}</div><div class="student-bottom">${button("내 답변 다시 보기", "arrow-left", "ghost", 'id="back-answers"')}${button(visible ? "감상 마치고 성찰하기" : "공개 상태 다시 확인", "arrow-right", "primary", 'id="finish-peers"')}</div>`,
    );
    root.querySelector("#back-answers").onclick = () => {
      step = 2;
      questions();
    };
    root.querySelector("#finish-peers").onclick = (event) =>
      run(event, async () => {
        if (!visible) {
          await refreshSession();
          await peers();
          return;
        }
        await write("viewed", {});
        step = 4;
        reflection();
      });
    if (visible) {
      const records = await request("deepening/student-peers", payload());
      if (stopped || step !== 3) return;
      const container = root.querySelector("#deep-peers");
      container.innerHTML = records.length
        ? perspectiveCards(records)
        : '<div class="notice">아직 다른 학생의 제출이 없습니다. 선생님과 다른 가능성을 논의하거나, 친구들의 제출을 기다렸다가 성찰해 보세요.</div>';
      container.onclick = (event) => {
        const id = event.target.closest("[data-record]")?.dataset.record;
        const r = records.find((r) => r.id === id);
        if (r)
          openModal({
            title: r.display_name,
            body: recordDetail(r),
            wide: true,
          });
      };
      refreshIcons();
    }
  }
  function reflection() {
    const values = draft.reflection ||
      data.record.reflection || { stance: "", answer: "" };
    frame(
      `<h2>지금도 처음과 같은 생각인가요?</h2><section class="deep-before"><span class="eyebrow">BEFORE · 나의 최초 판단</span><h3>${e(data.record.initial.choice)}</h3><p>${e(data.record.initial.reason)}</p><p>${e(data.record.initial.evidence)}</p></section><form id="deep-reflection" novalidate><fieldset class="deep-choices"><legend>나의 생각은</legend>${Object.entries(
        REFLECTIONS,
      )
        .map(
          ([value, [label]]) =>
            `<label><input type="radio" name="stance" value="${value}" ${values.stance === value ? "checked" : ""} required/><span>${label}</span></label>`,
        )
        .join(
          "",
        )}</fieldset><p id="reflection-prompt" class="deep-reflection-prompt">${e(REFLECTIONS[values.stance]?.[1] || "생각의 변화를 선택하면 성찰 질문이 나타납니다.")}</p>${field("최종 성찰", "answer", values.answer, { area: true, required: true, max: 5000, hint: "생각을 유지해도 괜찮습니다. 어떤 근거로 판단이 정교해졌는지 10자 이상 적어 주세요." })}<div class="student-bottom">${button("다른 관점 다시 보기", "arrow-left", "ghost", 'type="button" id="back-peers"')}<button class="btn primary" type="submit" ${data.session.status !== "OPEN" ? "disabled" : ""}>최종 성찰 완료 ${icon("check")}</button></div></form>`,
    );
    const form = root.querySelector("form");
    form.oninput = () => {
      draft.reflection = {
        stance: form.elements.stance.value,
        answer: form.elements.answer.value,
      };
      root.querySelector("#reflection-prompt").textContent =
        REFLECTIONS[draft.reflection.stance]?.[1] ||
        "생각의 변화를 선택해 주세요.";
      persist();
    };
    root.querySelector("#back-peers").onclick = () => {
      step = 3;
      peers().catch((e) => toast(e.message, "error"));
    };
    form.onsubmit = (event) =>
      run(event, async () => {
        if (formErrors(form)) return;
        await write("reflection", {
          stance: form.elements.stance.value,
          answer: form.elements.answer.value,
        });
        step = 5;
        safeStorage(key, null);
        draft = {};
        complete();
      });
  }
  function complete() {
    frame(
      `<div class="success-mark">${icon("check")}</div><h2>한 번 더 깊어진, 나의 생각.</h2><p class="step-hint">생각의 방향보다 작품과 근거로 설명한 과정이 중요합니다.</p>${reflectionMarkup(data.record)}<details><summary>나의 세 질문과 답변 모두 보기</summary>${recordDetail(data.record)}</details><div class="deep-code"><p>다른 기기에서 기록을 다시 볼 때 사용하는 개인 제출 코드</p><code>${e(code)}</code>${button("개인 코드 복사", "copy", "secondary", 'id="copy-deep-code"')}${button("내 활동 내려받기", "download", "ghost", 'id="download-deep-result"')}</div><a class="btn secondary" href="/exhibition?type=deepening">문학 전시관 관람하기 ${icon("arrow-up-right")}</a>`,
    );
    root.querySelector("#copy-deep-code").onclick = () => copyText(code);
    root.querySelector("#download-deep-result").onclick = () =>
      downloadText(
        JSON.stringify(
          { title: data.title, author: data.author, record: data.record },
          null,
          2,
        ),
        `LITVERSE-${data.title}-심화.json`,
      );
  }
  function draw() {
    if (stopped) return;
    if (!data.record) return join();
    if (step === 1) initial();
    else if (step === 2) questions();
    else if (step === 3) peers().catch((e) => toast(e.message, "error"));
    else if (step === 4) reflection();
    else complete();
  }
  async function refreshSession() {
    const next = await request("deepening/student-get", payload());
    if (stopped) return;
    const change =
      data.session.visibility !== next.session.visibility ||
      data.session.status !== next.session.status;
    data.session = next.session;
    // Never replace text being edited or a newer local answer with a polling response.
    if (step === 3 && change) await peers();
    if (change && next.session.status === "CLOSED")
      toast(
        "선생님이 심화 활동을 종료했습니다. 작성 중인 글은 임시저장으로 남습니다.",
      );
  }
  chooseStep();
  const conflictingDraft =
    data.record &&
    !data.record.completed_at &&
    draft.base_revision !== undefined &&
    draft.base_revision !== data.record.revision &&
    Object.keys(PURPOSES).some(
      (k) =>
        draft.answers?.[k] !== undefined &&
        draft.answers[k] !== (data.record.answers?.[k] || ""),
    );
  if (conflictingDraft) {
    frame(
      `<h2>다른 창에서 저장한 기록이 있어요.</h2><p class="step-hint">현재 기기의 초안도 보존했습니다. 두 기록을 확인한 뒤 이어갈 내용을 선택해 주세요.</p>${button("이 기기의 초안 내려받기", "download", "secondary", 'id="conflict-download"')}<div class="deep-secondary-actions flex wrap">${button("서버에 저장된 기록으로", "cloud", "primary", 'id="conflict-server"')}${button("이 기기의 초안 검토하기", "pencil", "secondary", 'id="conflict-local"')}</div>`,
    );
    root.querySelector("#conflict-download").onclick = () =>
      downloadText(JSON.stringify(draft, null, 2), "LITVERSE-보존한-초안.json");
    root.querySelector("#conflict-server").onclick = () => {
      safeStorage(`${key}:conflict-backup`, draft);
      draft = {};
      persist();
      draw();
    };
    root.querySelector("#conflict-local").onclick = () => {
      draft.base_revision = data.record.revision;
      step = 2;
      persist();
      draw();
    };
  } else draw();
  const timer = setInterval(() => {
    if (!busy) refreshSession().catch(() => {});
  }, 15000);
  const unsub = subscribe(activity.id, () =>
    busy ? Promise.resolve() : refreshSession().catch(() => {}),
  );
  const beforeLeave = () => persist();
  window.addEventListener("pagehide", beforeLeave);
  const online = () => {
    for (const purpose of [...dirty]) saveAnswer(purpose);
  };
  window.addEventListener("online", online);
  return () => {
    stopped = true;
    clearTimeout(saveTimer);
    clearInterval(timer);
    unsub();
    persist();
    window.removeEventListener("pagehide", beforeLeave);
    window.removeEventListener("online", online);
  };
}
