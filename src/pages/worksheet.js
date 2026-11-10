import {
  icon,
  button,
  field,
  customSelect,
  toast,
  copyText,
  formErrors,
} from "../components/ui.js";
import {
  studentShell,
  backgroundSummary,
  twoTabs,
  bindTabs,
  bindTagPicker,
} from "../components/student-ui.js";
import { request, isDemo } from "../services/api.js";
import { e, safeStorage, randomCode, downloadText } from "../utils/helpers.js";
import {
  STYLES,
  validCharacter,
  validScene,
  createPrompt,
  createScenePrompt,
} from "../utils/domain.js";
export function worksheetPage(root, activity, token) {
  const key = `litverse-draft:${token}`,
    saved = safeStorage(key) || {};
  let w = {
    student_label: safeStorage(`litverse-label:${activity.id}`) || "",
    character_name: "",
    character_selection_reason: "",
    personality_tags: [],
    personality_description: "",
    textual_evidence: "",
    evidence_explanation: "",
    canonical_appearance: "",
    imagined_appearance: "",
    image_style: activity.default_image_style,
    scene: {},
    ...saved.worksheet,
  };
  let tab = saved.tab || "character",
    mode = "intro",
    code =
      saved.code || safeStorage(`litverse-code:${activity.id}`) || randomCode(),
    stopped = false;
  const persist = () => {
    const ok = safeStorage(key, { worksheet: w, tab, mode, code });
    const status = root.querySelector("#save-state");
    if (status)
      status.textContent = ok
        ? "이 기기에 임시저장됨"
        : "기기 저장 실패 · 내용을 복사해 주세요";
  };
  const load = async () => {
    const result = await request("student/resume", { token, code });
    if (stopped) return;
    w = result.worksheet;
    mode = "done";
    persist();
    drawDone();
  };
  function intro() {
    mode = "intro";
    studentShell(
      root,
      activity,
      `<div class="student-container student-intro"><span class="eyebrow">BACKGROUND · CHARACTER · SCENE</span><h1>${e(activity.title)}</h1><p class="author">${e(activity.author)} 지음</p><div class="intro-rule"></div><p class="lead">${e(activity.introduction)}</p>${backgroundSummary(activity)}<div class="objective"><strong>완성할 두 가지 작품</strong>① 본문 근거로 해석한 인물 사진 한 장<br/>② 인상 깊은 사건을 표현한 장면 사진 한 장</div>${activity.settings.submission_questions ? `<div class="notice">사진을 제출할 때 선생님이 작성한 질문 ${activity.settings.submission_questions.length}개에 답하게 됩니다.</div>` : `<ol class="student-task-list">${activity.tasks.map((t) => `<li>${e(t)}</li>`).join("")}</ol>`}${activity.stage === "CLOSED" ? '<div class="notice">활동이 종료되었어요. 개인 제출 코드로 완료한 기록을 확인할 수 있습니다.</div>' : `<div class="student-start">${button(saved.worksheet?.character_name ? "작성하던 해석 이어가기" : "나의 해석 시작하기", "arrow-right", "primary", 'id="start"')}<span>인물과 사건, 두 가지 시선으로 읽어요.</span></div>`}${saved.mode === "done" ? `<div style="margin-top:20px">${button("완료한 두 프롬프트 보기", "file-text", "secondary", 'id="completed"')}</div>` : ""}<div class="student-note">${button("개인 제출 코드로 기록 불러오기", "lock-keyhole", "ghost", 'id="restore"')}</div></div>`,
    );
    root
      .querySelector("#start")
      ?.addEventListener("click", () =>
        w.student_label ? drawWork() : identity(),
      );
    root
      .querySelector("#completed")
      ?.addEventListener("click", () =>
        load().catch((err) => toast(err.message, "error")),
      );
    root.querySelector("#restore").onclick = restore;
  }
  function identity() {
    studentShell(
      root,
      activity,
      `<div class="student-container"><span class="eyebrow">BEFORE WE BEGIN</span><h1 class="step-title">당신의 시선을<br/>어떤 이름으로 남길까요?</h1><p class="step-hint">선생님이 안내한 학생 번호나 별칭을 사용해 주세요.<br/>실명이나 연락처는 필요하지 않아요.</p><form class="code-form" novalidate>${field("학생 번호 또는 별칭", "student_label", w.student_label, { required: true, max: 40 })}<button type="submit" class="btn primary">나의 해석 시작하기 ${icon("arrow-right")}</button></form></div>`,
    );
    root.querySelector("form").onsubmit = (ev) => {
      ev.preventDefault();
      if (formErrors(ev.currentTarget)) return;
      w.student_label = ev.currentTarget.elements.student_label.value.trim();
      safeStorage(`litverse-label:${activity.id}`, w.student_label);
      drawWork();
    };
  }
  function restore() {
    studentShell(
      root,
      activity,
      `<div class="student-container"><h1 class="step-title">나의 해석을 다시 만나기</h1><p class="step-hint">인물·사건 분석 완료 후 받은 개인 제출 코드를 입력해 주세요.</p><form class="code-form" novalidate>${field("개인 제출 코드", "code", "", { required: true, max: 100 })}<p class="step-error" role="alert"></p><button type="submit" class="btn primary">기록 불러오기</button></form></div>`,
    );
    root.querySelector("form").onsubmit = async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      if (formErrors(form)) return;
      form.querySelector("button").disabled = true;
      try {
        code = form.elements.code.value.trim();
        await load();
      } catch (err) {
        root.querySelector(".step-error").textContent = err.message;
        form.querySelector("button").disabled = false;
      }
    };
  }
  const textField = (label, name, min, hint = "", value = w[name]) =>
    field(label, name, value, {
      area: true,
      required: min > 0,
      max: name.startsWith("scene_")
        ? 3000
        : {
            character_selection_reason: 2000,
            evidence_quote: 2000,
            canonical_appearance: 3000,
            visual_description: 2000,
          }[name] || 4000,
      hint: hint || (min ? `${min}자 이상으로 구체적으로 작성해 주세요.` : ""),
    });
  function characterFields() {
    return `<section class="writing-section"><span class="eyebrow">01 / THE CHARACTER</span>${field("등장인물 이름", "character_name", w.character_name, { required: true, max: 80 })}${textField("이 인물을 선택한 이유", "character_selection_reason", 1)}</section><section class="writing-section"><span class="eyebrow">02 / INTERPRETATION & EVIDENCE</span><div class="field"><span>핵심 성격 키워드 · 1~3개</span><div class="tag-picker" id="personality-picker"></div></div>${textField("인물의 성격에 대한 나의 생각", "personality_description", 20)}${textField("왜 그렇게 생각했나요? 본문 속 근거", "textual_evidence", 20, "바로 위의 성격을 뒷받침하는 행동·대사·서술을 본문에서 찾아 20자 이상 작성해 주세요.")}${textField("근거와 성격을 연결한 이유", "evidence_explanation", 10)}${textField("본문의 대사나 서술 직접 인용 (선택)", "evidence_quote", 0)}</section><section class="writing-section"><span class="eyebrow">03 / A PORTRAIT OF PERSONALITY</span>${textField("작품에 실제로 제시된 외모 (선택)", "canonical_appearance", 0)}${textField("성격이 드러나도록 상상한 인물의 모습", "imagined_appearance", 20, "눈빛·표정·옷차림·자세에 성격이 드러나게 20자 이상 묘사해 주세요. 상상과 원작의 사실을 구분합니다.")}${textField("인물의 분위기와 감정 (선택)", "visual_description", 0)}<div class="field"><span>인물 사진 스타일</span>${customSelect({ name: "image_style", label: "인물 사진 스타일", value: w.image_style, options: STYLES })}</div></section>`;
  }
  function sceneFields() {
    return `<section class="writing-section"><span class="eyebrow">01 / A MEMORABLE EVENT</span>${[
      ["name", "가장 인상 깊은 사건", 10],
      ["reason", "이 사건이 인상 깊었던 이유", 10],
      ["development", "본문에 나타난 사건의 전개", 10],
      ["behavior", "사건 속 인물의 행동", 10],
      ["impact", "인물이나 주제에 미친 영향 (선택)", 0],
    ]
      .map(([name, label, min]) =>
        textField(label, `scene_${name}`, min, "", w.scene?.[name]),
      )
      .join(
        "",
      )}</section><section class="writing-section"><span class="eyebrow">02 / BRING THE SCENE TO LIFE</span>${textField("사진으로 표현할 장면의 구체적인 모습", "scene_visual", 10, "선택한 이유가 드러나도록 장소, 인물의 행동, 구도, 빛과 분위기를 10자 이상 묘사해 주세요.", w.scene?.visual)}<div class="field"><span>사건 장면 사진 스타일</span>${customSelect({ name: "scene_image_style", label: "사건 장면 사진 스타일", value: w.scene?.image_style || activity.default_image_style, options: STYLES })}</div></section>`;
  }
  function drawWork() {
    mode = "worksheet";
    persist();
    const character = tab === "character";
    const valid = () =>
      character ? validCharacter(w) : validCharacter(w) && validScene(w.scene);
    studentShell(
      root,
      activity,
      `<div class="student-container worksheet-container">${twoTabs(tab, { character: validCharacter(w), scene: validScene(w.scene) })}<div class="step-meta" style="margin-top:25px"><span class="eyebrow">${character ? "CHARACTER & EVIDENCE" : "EVENT & MEANING"}</span><span class="saving" id="save-state">이 기기에 임시저장됨</span></div><div id="student-work-panel" role="tabpanel" aria-labelledby="${tab}-tab"><h1 class="step-title">${character ? "이 인물은 어떤 사람인가요?<br/>본문에서 근거를 찾아볼까요?" : "어떤 사건이 마음에 남았나요?<br/>그 이유를 장면에 담아 보세요."}</h1><p class="step-hint">${character ? "성격을 먼저 쓰고, 바로 아래에 왜 그렇게 생각했는지 본문을 바탕으로 적어 주세요." : "인상 깊은 사건과 선택 이유를 작성하고, 한 장의 사진으로 표현할 장면을 구체화해요."}</p>${backgroundSummary(activity)}<form class="worksheet-form" novalidate>${character ? characterFields() : sceneFields()}</form><p class="step-error" role="alert" id="step-error"></p><div class="student-bottom">${button(character ? "안내로" : "인물 다시 보기", "arrow-left", "ghost", 'id="previous"')}${button(character ? "다음: 사건과 이유" : "두 프롬프트 완성", "arrow-right", "primary", `id="next" ${valid() ? "" : "disabled"}`)}</div></div></div>`,
    );
    const next = root.querySelector("#next");
    const update = (ev) => {
      const name = ev.target.name;
      if (!name) return;
      if (name.startsWith("scene_"))
        w.scene = { ...w.scene, [name.slice(6)]: ev.target.value };
      else w[name] = ev.target.value;
      persist();
      next.disabled = !valid();
    };
    const form = root.querySelector("form");
    form.oninput = update;
    form.onchange = update;
    form.onsubmit = (ev) => ev.preventDefault();
    if (character)
      bindTagPicker(root.querySelector("#personality-picker"), {
        tags: [...w.personality_tags],
        suggestions: activity.tags,
        max: 3,
        onChange: (tags) => {
          w.personality_tags = tags;
          persist();
          next.disabled = !valid();
        },
      });
    bindTabs(root, (nextTab) => {
      if (nextTab === "scene" && !validCharacter(w)) {
        toast(
          "인물의 성격·본문 근거·시각적 묘사를 먼저 완성해 주세요.",
          "error",
        );
        return;
      }
      tab = nextTab;
      drawWork();
      window.scrollTo(0, 0);
    });
    root.querySelector("#previous").onclick = () => {
      if (character) intro();
      else {
        tab = "character";
        drawWork();
      }
      window.scrollTo(0, 0);
    };
    next.onclick = async () => {
      if (!valid()) return;
      if (character) {
        tab = "scene";
        drawWork();
        window.scrollTo(0, 0);
        return;
      }
      next.disabled = true;
      try {
        const result = await request("student/complete", {
          token,
          code,
          worksheet: w,
        });
        if (stopped) return;
        w = result.worksheet;
        code = result.code;
        safeStorage(`litverse-code:${activity.id}`, code);
        mode = "done";
        persist();
        tab = "character";
        drawDone();
        window.scrollTo(0, 0);
      } catch (error) {
        root.querySelector("#step-error").textContent = error.message;
        next.disabled = false;
      }
    };
  }
  function drawDone() {
    mode = "done";
    persist();
    const character = tab === "character",
      portrait = w.generated_prompt || createPrompt(activity, w),
      scene = w.scene_prompt || createScenePrompt(activity, w),
      prompt = character ? portrait : scene;
    studentShell(
      root,
      activity,
      `<div class="student-container"><div class="success-mark">${icon("check")}</div><span class="eyebrow">TWO PERSPECTIVES, READY TO CREATE</span><h1 class="step-title">인물의 마음, 사건의 순간.<br/>두 장의 작품으로 표현해요.</h1><p class="step-hint">각 탭의 프롬프트를 외부 AI에 복사해서<br/>인물 사진 한 장과 사건 장면 사진 한 장을 만들어 주세요.</p>${twoTabs(tab, { character: true, scene: true })}<section class="prompt-card" id="student-work-panel" role="tabpanel" aria-labelledby="${tab}-tab" style="margin-top:20px"><div class="between"><div><span class="eyebrow">${character ? "CHARACTER PORTRAIT" : "MEMORABLE SCENE"}</span><h3 style="margin-top:8px">${e(character ? w.character_name + "의 성격" : w.scene?.name)}</h3></div>${button("프롬프트 복사", "copy", "secondary small", 'id="copy-prompt"')}</div><pre>${e(prompt)}</pre></section><div style="margin-top:30px"><h3 style="font-size:15px">두 작품에 함께 사용하는 개인 제출 코드</h3><p class="student-note" style="margin-top:10px">이 코드로 두 사진을 같은 분석 기록에 연결해요. 다른 사람에게 공유하지 마세요.</p><div class="submission-code"><code>${e(code)}</code><button class="icon-btn" id="copy-code" aria-label="개인 제출 코드 복사">${icon("copy")}</button></div></div><div class="completion-actions">${button("두 프롬프트·제출 코드 다운로드", "download", "secondary", 'id="download"')}<div class="form-grid"><a class="btn secondary" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT 열기 ${icon("external-link")}</a><a class="btn secondary" href="https://gemini.google.com/" target="_blank" rel="noopener noreferrer">Gemini 열기 ${icon("external-link")}</a></div>${isDemo ? `<a class="btn primary" href="/submit/${e(activity.submission_token)}">두 사진 제출하기 ${icon("arrow-right")}</a>` : '<div class="notice">두 사진을 완성하면 선생님이 안내하는 이미지 제출 QR로 접속해 주세요.</div>'}${activity.stage !== "CLOSED" ? button("해석 다시 다듬기", "arrow-left", "ghost", 'id="edit"') : ""}</div></div>`,
    );
    bindTabs(root, (newTab) => {
      tab = newTab;
      drawDone();
    });
    root.querySelector("#copy-prompt").onclick = () => copyText(prompt);
    root.querySelector("#copy-code").onclick = () => copyText(code);
    root.querySelector("#download").onclick = () =>
      downloadText(
        `[인물 성격 사진]\n${portrait}\n\n[인상 깊은 사건 장면 사진]\n${scene}\n\n[개인 제출 코드]\n${code}`,
        `LITVERSE-${activity.title}-두-프롬프트.txt`,
      );
    root.querySelector("#edit")?.addEventListener("click", () => {
      tab = "character";
      drawWork();
    });
  }
  intro();
  return () => {
    stopped = true;
  };
}
