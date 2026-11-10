import { icon, button, field, formErrors, toast } from "../components/ui.js";
import {
  studentShell,
  twoTabs,
  bindTabs,
  bindTagPicker,
} from "../components/student-ui.js";
import { request, uploadImage } from "../services/api.js";
import { e, safeStorage, optimizeImage } from "../utils/helpers.js";
import { questionResponseList } from "../components/submission-questions.js";
import {
  submissionQuestions,
  validateQuestionResponses,
  ANSWER_MAX_LENGTH,
} from "../utils/submission-questions.js";
import { submissionProgress } from "../utils/domain.js";
export function submissionPage(root, activity, token) {
  let code = safeStorage(`litverse-code:${activity.id}`) || "",
    worksheet,
    images = [],
    tab = "character",
    stopped = false,
    busy = false,
    pasteHandler;
  const drafts = Object.fromEntries(
    ["character", "scene"].map((type) => [
      type,
      {
        blob: null,
        url: null,
        tags: [],
        caption: "",
        responses: [],
        requestId: crypto.randomUUID(),
      },
    ]),
  );
  function drawCode() {
    studentShell(
      root,
      activity,
      `<div class="student-container"><span class="eyebrow">TWO IMAGES, ONE INTERPRETATION</span><h1 class="step-title">인물과 사건,<br/>두 장의 시선을 모아요.</h1><p class="step-hint">개인 제출 코드로 인물과 사건 분석을 불러온 뒤<br/>각각의 탭에 사진을 한 장씩 제출하세요.</p><form class="code-form" novalidate>${field("개인 제출 코드", "code", code, { required: true, max: 100 })}<p class="step-error" id="code-error" role="alert"></p><button type="submit" class="btn primary">나의 두 분석 불러오기 ${icon("arrow-right")}</button></form><p class="student-note">코드를 분실했다면 선생님께 재발급을 요청해 주세요.</p></div>`,
    );
    root.querySelector("form").onsubmit = async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      if (formErrors(form)) return;
      form.querySelector("button").disabled = true;
      try {
        code = form.elements.code.value.trim();
        const result = await request("student/resume", { token, code });
        if (stopped) return;
        worksheet = result.worksheet;
        images = result.images;
        activity = result.activity;
        drafts.character.tags = [...worksheet.personality_tags];
        drafts.scene.tags = [...worksheet.personality_tags];
        for (const type of ["character", "scene"]) {
          const saved = safeStorage(
            `litverse-upload-answers:${activity.id}:${code}:${type}`,
          );
          const prior = images.find((image) => image.image_type === type);
          drafts[type].responses = submissionQuestions(activity).map(
            (question) => ({
              question,
              answer:
                saved?.find((response) => response.question === question)
                  ?.answer ??
                prior?.question_responses?.find(
                  (response) => response.question === question,
                )?.answer ??
                "",
            }),
          );
        }
        safeStorage(`litverse-code:${activity.id}`, code);
        drawUpload();
      } catch (error) {
        root.querySelector("#code-error").textContent = error.message;
        form.querySelector("button").disabled = false;
      }
    };
  }
  function drawUpload() {
    document.removeEventListener("paste", pasteHandler);
    const draft = drafts[tab],
      character = tab === "character",
      progress = submissionProgress(images, worksheet.id),
      prior = images.find((i) => i.image_type === tab),
      locked =
        activity.stage !== "SUBMISSION" ||
        (prior && !activity.settings.allow_resubmit);
    const questions = submissionQuestions(activity);
    const questionMode = questions.length > 0;
    const answersComplete = () =>
      draft.responses.length === questions.length &&
      draft.responses.every((response) => response.answer.trim());
    const submissionFields = questionMode
      ? `<div class="upload-questions"><h2>사진과 함께 답해 주세요.</h2>${questions.map((question, index) => field(`${index + 1}. ${question}`, `question_answer_${index}`, draft.responses[index]?.answer || "", { area: true, required: true, max: ANSWER_MAX_LENGTH, placeholder: "사진에 담은 자신의 생각을 적어 주세요." })).join("")}</div>`
      : `<div class="field"><span>${character ? "사진에서 드러나는 인물의 성격" : "장면 속 인물의 성격 키워드"}</span><div class="tag-picker" id="upload-tags"></div></div>${field(character ? "인물 사진에서 강조한 특징" : "사건 장면 사진에서 강조한 특징", "caption", draft.caption, { area: true, required: true, max: 150 })}<div class="char-count" id="caption-count">${draft.caption.length} / 150</div>`;
    studentShell(
      root,
      activity,
      `<div class="student-container"><span class="eyebrow">${Number(progress.character) + Number(progress.scene)} / 2 IMAGES SUBMITTED</span><h1 class="step-title">${character ? "인물의 성격을<br/>한 장의 사진에 담아 주세요." : "인상 깊은 사건을<br/>한 장면으로 보여 주세요."}</h1><p class="step-hint">${e(activity.title)} · ${e(worksheet.student_label)}<br/>인물 1장 + 사건 1장, 모두 제출하면 활동이 완료됩니다.</p>${twoTabs(tab, progress)}<section id="student-work-panel" role="tabpanel" aria-labelledby="${tab}-tab"><div class="submission-context"><span class="eyebrow">${character ? "나의 성격 해석과 본문 근거" : "선택한 사건과 이유"}</span><p>${e(character ? worksheet.personality_description : worksheet.scene?.name)}</p><p class="muted">${e(character ? worksheet.textual_evidence : worksheet.scene?.reason)}</p></div>${prior ? '<div class="notice" style="margin-bottom:20px">이 탭의 사진을 이미 제출했어요. 허용된 경우 다시 제출하면 이 사진만 교체됩니다.</div>' : ""}<form id="upload-form" class="worksheet-form" novalidate>${locked ? `<div class="notice">${activity.stage !== "SUBMISSION" ? "선생님이 이미지 제출을 열면 사진을 올릴 수 있어요." : "이미 제출했어요. 이 활동은 재제출을 허용하지 않습니다."}</div>${prior ? `<img class="upload-preview" src="${e(prior.image_url)}" alt="이미 제출한 사진"/>` : ""}` : `<div><div class="upload-dropzone" id="dropzone">${draft.blob ? `<img class="upload-preview" src="${draft.url}" alt="제출할 이미지 미리보기"/>` : `${icon("image-plus")}<strong>${character ? "인물 사진" : "사건 장면 사진"} 선택하기</strong><p>끌어 놓기 · Ctrl+V 붙여넣기도 가능해요.<br/>JPG, PNG, WebP · 원본 12MB 이하</p>`}<input type="file" class="file-input" id="image-file" accept="image/jpeg,image/png,image/webp" aria-label="${character ? "인물" : "사건 장면"} 이미지 파일 선택"/></div>${draft.blob ? `<div class="upload-preview-actions"><span class="muted" style="font-size:11px;margin-right:auto;padding-top:12px">${(draft.blob.size / 1024).toFixed(0)}KB</span>${button("이미지 제거", "x", "ghost", 'id="remove-preview"')}</div>` : ""}</div>${submissionFields}<p class="step-error" id="upload-error" role="alert"></p><div class="progress-track" id="upload-progress" hidden role="progressbar" aria-label="이미지 업로드 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="progress-fill" style="width:0%"></div></div><button type="submit" class="btn primary" id="submit-image" ${draft.blob && (questionMode ? answersComplete() : draft.caption.trim() && draft.tags.length) ? "" : "disabled"}>${icon("upload")} ${character ? "인물 사진" : "사건 장면 사진"} ${prior ? "교체하기" : "제출하기"}</button>`}</form></section><p class="student-note">사진 비율을 유지해 긴 변 1,600px 이하로 최적화합니다. ${activity.settings.require_approval ? "교사 승인 후 전시됩니다." : "제출 후 전시됩니다."}</p></div>`,
    );
    bindTabs(root, (newTab) => {
      if (!busy) {
        tab = newTab;
        drawUpload();
      }
    });
    if (locked) return;
    const form = root.querySelector("#upload-form"),
      submit = root.querySelector("#submit-image"),
      update = () =>
        (submit.disabled =
          busy ||
          !draft.blob ||
          (questionMode
            ? !answersComplete()
            : !draft.caption.trim() || !draft.tags.length));
    if (!questionMode) {
      bindTagPicker(root.querySelector("#upload-tags"), {
        tags: [...draft.tags],
        suggestions: activity.tags,
        max: 5,
        onChange: (tags) => {
          draft.tags = tags;
          draft.requestId = crypto.randomUUID();
          update();
        },
      });
      form.elements.caption.oninput = (ev) => {
        draft.caption = ev.target.value;
        draft.requestId = crypto.randomUUID();
        root.querySelector("#caption-count").textContent =
          `${draft.caption.length} / 150`;
        update();
      };
    } else {
      questions.forEach((question, index) => {
        form.elements.namedItem(`question_answer_${index}`).oninput = (
          event,
        ) => {
          draft.responses[index] = { question, answer: event.target.value };
          draft.requestId = crypto.randomUUID();
          safeStorage(
            `litverse-upload-answers:${activity.id}:${code}:${tab}`,
            draft.responses,
          );
          update();
        };
      });
    }
    const setFile = async (file) => {
      if (!file || busy) return;
      busy = true;
      update();
      try {
        const blob = await optimizeImage(file);
        if (stopped) return;
        if (draft.url) URL.revokeObjectURL(draft.url);
        draft.blob = blob;
        draft.url = URL.createObjectURL(blob);
        draft.requestId = crypto.randomUUID();
        busy = false;
        drawUpload();
        toast("사진을 준비했어요.");
      } catch (error) {
        toast(error.message, "error");
        busy = false;
        update();
      }
    };
    root.querySelector("#image-file").onchange = (ev) =>
      setFile(ev.target.files[0]);
    root.querySelector("#remove-preview")?.addEventListener("click", () => {
      URL.revokeObjectURL(draft.url);
      draft.url = null;
      draft.blob = null;
      draft.requestId = crypto.randomUUID();
      drawUpload();
    });
    const zone = root.querySelector("#dropzone");
    zone.ondragover = (ev) => {
      ev.preventDefault();
      zone.classList.add("dragging");
    };
    zone.ondragleave = () => zone.classList.remove("dragging");
    zone.ondrop = (ev) => {
      ev.preventDefault();
      zone.classList.remove("dragging");
      setFile(ev.dataTransfer.files[0]);
    };
    pasteHandler = (ev) => {
      const item = [...(ev.clipboardData?.items || [])].find((i) =>
        i.type.startsWith("image/"),
      );
      if (item) {
        ev.preventDefault();
        setFile(item.getAsFile());
      }
    };
    document.addEventListener("paste", pasteHandler);
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      if (
        busy ||
        !draft.blob ||
        (questionMode
          ? !answersComplete()
          : !draft.caption.trim() || !draft.tags.length)
      )
        return;
      if (formErrors(form)) return;
      busy = true;
      form.inert = true;
      root.querySelector("#upload-progress").hidden = false;
      try {
        const image = await uploadImage(
          {
            token,
            code,
            image_type: tab,
            slot: 0,
            hashtags: draft.tags,
            one_line_description: questionMode
              ? draft.responses[0].answer.trim().slice(0, 150)
              : draft.caption.trim(),
            question_responses: questionMode
              ? validateQuestionResponses(activity, draft.responses)
              : [],
            request_id: draft.requestId,
          },
          draft.blob,
          (percent) => {
            if (stopped) return;
            const bar = root.querySelector("#upload-progress");
            bar.setAttribute("aria-valuenow", percent);
            bar.firstElementChild.style.width = `${percent}%`;
          },
        );
        if (stopped) return;
        images = images.filter((i) => i.image_type !== tab).concat(image);
        safeStorage(
          `litverse-upload-answers:${activity.id}:${code}:${tab}`,
          null,
        );
        busy = false;
        success(image);
      } catch (error) {
        if (stopped) return;
        root.querySelector("#upload-error").textContent = error.message;
        busy = false;
        form.inert = false;
        update();
      }
    };
  }
  function success(image) {
    document.removeEventListener("paste", pasteHandler);
    const progress = submissionProgress(images, worksheet.id);
    studentShell(
      root,
      activity,
      `<div class="student-container"><div class="success-mark">${icon("check")}</div><span class="eyebrow">${Number(progress.character) + Number(progress.scene)} / 2 IMAGES SUBMITTED</span><h1 class="step-title">${progress.complete ? "두 장의 작품이<br/>우리의 이야기에 더해졌어요." : tab === "character" ? "인물 사진을 제출했어요.<br/>이제 사건 장면을 이어가요." : "사건 장면을 제출했어요.<br/>인물 사진도 완성해 주세요."}</h1><p class="step-hint">${progress.complete ? "인물의 성격과 사건의 의미를 모두 표현했어요." : "두 사진을 모두 제출해야 활동이 완료됩니다."}<br/>${image.approval_status === "approved" ? "제출한 작품은 전시에 공개됩니다." : "선생님의 승인을 기다려 주세요."}</p>${twoTabs(tab, progress)}<div id="student-work-panel" role="tabpanel" aria-labelledby="${tab}-tab" style="margin-top:20px"><img class="upload-preview" src="${e(image.image_url || drafts[tab].url)}" alt="제출 완료한 나의 작품" style="border-radius:12px;max-height:400px"/><p class="muted" style="font-size:14px;margin-top:20px">${e(image.one_line_description)}</p>${questionResponseList(image.question_responses)}</div><div class="completion-actions">${button(progress.complete ? "두 사진 제출 내역 확인" : progress.character ? "다음: 사건 장면 사진 제출" : "다음: 인물 사진 제출", "arrow-right", "primary", 'id="continue"')}</div></div>`,
    );
    bindTabs(root, (newTab) => {
      tab = newTab;
      drawUpload();
    });
    root.querySelector("#continue").onclick = () => {
      if (!progress.complete) tab = progress.character ? "scene" : "character";
      drawUpload();
      window.scrollTo(0, 0);
    };
  }
  drawCode();
  return () => {
    stopped = true;
    document.removeEventListener("paste", pasteHandler);
    Object.values(drafts).forEach((d) => {
      if (d.url) URL.revokeObjectURL(d.url);
    });
  };
}
