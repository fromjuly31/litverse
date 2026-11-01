import { teacherShell, pageHeading } from "./teacher.js";
import { request } from "../services/api.js";
import {
  field,
  formErrors,
  icon,
  confirmDialog,
  toast,
} from "../components/ui.js";
import { posterMarkup } from "../components/poster.js";
import { finalResult } from "../utils/archive.js";
import { artworkSource } from "../utils/artwork.js";
import { e } from "../utils/helpers.js";
import { navigate } from "../main.js";

export function completedLesson(root, data) {
  const a = data.activity;
  teacherShell(
    root,
    "completed",
    null,
    `<section class="panel completed-class"><span class="eyebrow">A STORY, NOW IN OUR COLLECTION</span><h1>「${e(a.title)}」 수업을 마쳤어요.</h1><p>줄거리와 배경, 두 장의 최종 작품이 문학 전시관에 보관되어 있습니다.<br/>다시 열면 전시가 잠시 내려가고, 수정 후 다시 완성할 수 있어요.<br/>이전에 정리한 나머지 사진은 복구되지 않습니다.</p><div class="flex wrap"><a class="btn primary" href="/exhibition/${e(a.id)}">${icon("images")} 완성 포스터 관람</a><button class="btn secondary" id="reopen-lesson">${icon("rotate-ccw")} 수업 다시 열기</button></div><a class="text-link" href="/teacher">수업 목록으로</a></section>`,
  );
  root.querySelector("#reopen-lesson").onclick = () =>
    confirmDialog({
      title: "이 수업을 다시 열까요?",
      message:
        "완성 포스터가 전시관에서 내려갑니다. 보관한 두 장의 사진과 분석을 수정하고 다시 완료하면 재전시됩니다.",
      confirm: "수업 다시 열기",
      onConfirm: async () => {
        await request("teacher/reopen", { id: a.id });
        await navigate(`/teacher/activity/${a.id}/background`, true);
      },
    });
}

export function finalizePage(root, data) {
  const a = data.activity,
    old = a.final_result;
  const picked = {
    character: a.final_selection?.character || old?.character?.image_id || "",
    scene: a.final_selection?.scene || old?.scene?.image_id || "",
  };
  const worksheet = (id) =>
    data.worksheets.find(
      (w) => w.id === data.images.find((i) => i.id === id)?.worksheet_id,
    );
  const initialSummary = (type) =>
    type === "character"
      ? old?.character?.description ||
        worksheet(picked.character)?.personality_description ||
        ""
      : old?.scene?.description || worksheet(picked.scene)?.scene?.reason || "";
  const choices = (type) => {
    const images = data.images.filter((i) => i.image_type === type);
    return images.length
      ? `<div class="final-choices">${images
          .map((i) => {
            const w = worksheet(i.id);
            return `<label class="final-option"><input type="radio" name="${type}_image_id" value="${e(i.id)}" ${picked[type] === i.id ? "checked" : ""} required aria-label="${e(w?.student_label)} ${type === "character" ? "인물" : "사건"} 최종본"/><img src="${e(artworkSource(i.image_url))}" alt="${e(i.one_line_description)}" loading="lazy"/><strong>${e(type === "character" ? w?.character_name : w?.scene?.name)}</strong><small>${e(w?.student_label)}</small><span>이 사진을 최종본으로 선택</span></label>`;
          })
          .join("")}</div>`
      : `<div class="notice">아직 ${type === "character" ? "인물" : "사건"} 사진이 없습니다. 학생의 사진을 제출받은 뒤 마무리해 주세요.</div>`;
  };
  const removed = Math.max(0, data.images.length - 2);
  teacherShell(
    root,
    "finalize",
    a,
    `${pageHeading("CURATE YOUR FINAL EXHIBITION", "우리의 해석을, 한 장의 작품으로.", "함께 고른 두 장의 사진과 이야기를 문학 전시관에 남깁니다.")}<p class="finalize-intro">인물과 사건 사진을 한 장씩 골라 주세요. 아래에서 글을 다듬고 포스터를 미리 볼 수 있습니다.<br/>최종 완료하면 선택한 두 장을 보관하고, 나머지 <b>${removed}장</b>은 삭제합니다. 수업의 분석 글은 유지됩니다.</p><form id="finalize-form" class="finalize-editor" novalidate><section class="finalize-section"><h2>01. 인물의 성격을 가장 잘 담은 사진</h2><p>표정과 행동, 본문의 근거를 함께 살펴보고 한 장을 골라 주세요.</p>${choices("character")}</section><section class="finalize-section"><h2>02. 오래 기억하고 싶은 사건의 한 장면</h2><p>인상 깊은 사건을 가장 잘 표현한 한 장을 골라 주세요.</p>${choices("scene")}</section><section class="panel finalize-section"><h2>03. 전시작에 담을 이야기</h2><div class="stack">${field("포스터 줄거리", "synopsis", a.synopsis || old?.synopsis, { area: true, required: true, max: 1800 })}<div class="form-grid">${field("시간적 배경 정리", "temporal_background", a.temporal_background, { area: true, required: true, max: 1200 })}${field("공간적 배경 정리", "spatial_background", a.spatial_background, { area: true, required: true, max: 1200 })}${field("인물 성격 정리", "character_summary", initialSummary("character"), { area: true, required: true, max: 1600 })}${field("인상 깊은 사건 정리", "scene_summary", initialSummary("scene"), { area: true, required: true, max: 1600 })}</div>${field("전시작 제작자 이름 · 서명", "signature", a.signature, { required: true, max: 60, placeholder: "예: 김문학 · 2학년 3반", hint: "원작 작가와 별도로, 이 포스터를 만든 이름이 전시관 아래에 서명으로 남습니다. 공개해도 되는 이름을 적어 주세요." })}</div></section><p class="step-error" id="finalize-error" role="alert"></p><div class="finalize-actions"><p>보관 2장 · 나머지 ${removed}장 정리</p><div class="flex wrap"><button type="button" class="btn secondary" id="preview-final">${icon("eye")} 포스터 미리보기</button><button type="submit" class="btn primary">${icon("check")} 수업 완료 · 전시하기</button></div></div></form><section class="final-preview" id="final-preview" hidden></section>`,
  );
  const form = root.querySelector("form"),
    error = root.querySelector("#finalize-error"),
    preview = root.querySelector("#final-preview");
  const read = () => {
    if (formErrors(form)) return null;
    try {
      const input = Object.fromEntries(new FormData(form));
      const result = finalResult(a, data.worksheets, data.images, input);
      error.textContent = "";
      return { input, result };
    } catch (err) {
      error.textContent = err.message;
      return null;
    }
  };
  form.addEventListener("change", (ev) => {
    if (!ev.target.matches("input[type=radio]")) return;
    const type = ev.target.name.startsWith("character") ? "character" : "scene",
      w = worksheet(ev.target.value),
      input = form.elements[`${type}_summary`];
    if (!input.dataset.edited)
      input.value =
        type === "character"
          ? w.personality_description || ""
          : w.scene?.reason || "";
  });
  for (const type of ["character", "scene"])
    form.elements[`${type}_summary`].addEventListener(
      "input",
      (ev) => (ev.target.dataset.edited = "true"),
    );
  root.querySelector("#preview-final").onclick = () => {
    const value = read();
    if (!value) return;
    preview.hidden = false;
    preview.innerHTML = `<div class="poster-print-area">${posterMarkup(value.result, data.images)}</div>`;
    preview.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  form.onsubmit = (ev) => {
    ev.preventDefault();
    const value = read();
    if (!value) return;
    confirmDialog({
      title: "두 장을 남기고 전시를 완성할까요?",
      message: `인물 1장과 사건 1장을 보관하고 나머지 ${removed}장은 삭제합니다. 삭제한 사진은 복구할 수 없습니다. 완성 포스터와 제작자 서명은 전시관에 공개됩니다.`,
      confirm: "최종 완료하고 전시",
      danger: removed > 0,
      onConfirm: async () => {
        const saved = await request("teacher/finalize", {
          id: a.id,
          result: value.input,
        });
        await navigate(`/exhibition/${a.id}`);
        toast(
          saved.cleanup_pending
            ? "전시는 완료됐어요. 일부 사진 정리는 대기 중이며 서버가 재시도합니다."
            : "두 장의 작품을 보관하고 전시를 완성했어요.",
        );
      },
    });
  };
}
