import { questionResponseList } from "./submission-questions.js";
import { artworkSource } from "../utils/artwork.js";
import {
  icon,
  button,
  openModal,
  confirmDialog,
  refreshIcons,
  toast,
} from "./ui.js";
import { e, downloadBlob } from "../utils/helpers.js";
import { request } from "../services/api.js";
export function artCard(
  image,
  worksheets,
  {
    selectable = false,
    selected = false,
    chooseFinal = false,
    finalSelected = false,
  } = {},
) {
  const w = worksheets.find((w) => w.id === image.worksheet_id) || {};
  const title =
    image.image_type === "scene"
      ? w.scene?.name || "사건 장면"
      : w.character_name || "이름 없는 인물";
  return `<article class="art-card ${selected ? "selected" : ""}" data-art-id="${e(image.id)}" data-image-type="${e(image.image_type)}">${selectable ? `<label class="card-select"><input type="checkbox" data-select-image="${e(image.id)}" aria-label="${e(w.student_label)}의 ${e(title)} 작품 선택" ${selected ? "checked" : ""}/></label>` : ""}<button class="art-hit" type="button" data-open-art="${e(image.id)}" aria-label="${e(w.student_label)}의 ${e(title)} 작품 자세히 보기"><div class="art-image"><img src="${e(artworkSource(image.image_url))}" alt="${e(image.one_line_description)}" loading="lazy" decoding="async"/><span class="badge ${image.approval_status === "approved" ? "blue" : ""}">${image.approval_status === "approved" ? "전시 중" : image.approval_status === "hidden" ? "비공개" : "승인 대기"}</span></div><div class="art-caption"><div class="between"><h3 class="scene-title">${e(title)}</h3><small>${e(w.student_label)}</small></div><p>${e(image.one_line_description)}</p><div class="chip-row">${image.hashtags.map((t) => `<span class="tag">#${e(t)}</span>`).join("")}</div></div></button>${chooseFinal ? `<button class="btn secondary small final-pick" data-final-pick="${e(image.id)}" aria-pressed="${finalSelected}">${icon(finalSelected ? "check" : "images")}${finalSelected ? "최종본으로 선택됨" : "최종본 선택"}</button>` : ""}</article>`;
}
export async function downloadImage(image) {
  const response = await fetch(artworkSource(image.image_url));
  if (!response.ok)
    throw new Error(
      "이미지를 내려받지 못했어요. 새로고침 후 다시 시도해 주세요.",
    );
  const blob = await response.blob();
  const ext = blob.type.includes("svg")
    ? "svg"
    : blob.type.includes("png")
      ? "png"
      : blob.type.includes("jpeg")
        ? "jpg"
        : "webp";
  downloadBlob(blob, `LITVERSE-${image.id}.${ext}`);
}
export function showArt(
  image,
  data,
  { manage = true, onChange = () => {} } = {},
) {
  const w = data.worksheets.find((w) => w.id === image.worksheet_id) || {};
  const modal = openModal({
    title: `${image.image_type === "scene" ? "사건 장면" : w.character_name} — ${w.student_label}`,
    eyebrow: `${data.activity.title} / A DIFFERENT PERSPECTIVE`,
    wide: true,
    body: `<div class="detail-grid"><img class="detail-image" src="${e(artworkSource(image.image_url))}" alt="${e(image.one_line_description)}"/><div class="detail-copy"><div><span class="eyebrow">${image.image_type === "scene" ? "SCENE" : "CHARACTER"} INTERPRETATION</span><h3 style="margin-top:9px">${e(image.image_type === "scene" ? w.scene?.name : w.character_name)}</h3></div><div class="chip-row">${image.hashtags.map((t) => `<span class="tag">#${e(t)}</span>`).join("")}</div><p>${e(image.one_line_description)}</p>${questionResponseList(image.question_responses)}<div><h4>${image.image_type === "scene" ? "이 사건이 인상 깊었던 이유" : "인물에 대한 해석"}</h4><p>${e(image.image_type === "scene" ? w.scene?.reason : w.personality_description)}</p></div><div><h4>작품 속 근거</h4><p>${e(image.image_type === "scene" ? w.scene?.development : w.textual_evidence)}${w.evidence_quote ? "\n" + e(w.evidence_quote) : ""}</p></div><div><h4>${image.image_type === "scene" ? "사건 속 인물의 행동과 장면 표현" : "근거를 해석한 이유"}</h4><p>${e(image.image_type === "scene" ? w.scene?.behavior + "\n" + w.scene?.visual : w.evidence_explanation)}</p></div><div><h4>이미지 생성 프롬프트</h4><p class="prompt-preview">${e(image.image_type === "scene" ? w.scene_prompt : w.generated_prompt)}</p></div></div></div>`,
    footer: `${button("다운로드", "download", "secondary", 'id="art-download"')}${manage ? `${button("삭제", "trash-2", "ghost", 'id="art-delete"')}${button(image.approval_status === "approved" ? "비공개로 전환" : "전시 승인", image.approval_status === "approved" ? "eye-off" : "check", "primary", 'id="art-approve"')}` : ""}`,
  });
  modal.element.querySelector("#art-download").onclick = async () => {
    try {
      await downloadImage(image);
    } catch (error) {
      toast(error.message, "error");
    }
  };
  if (manage) {
    modal.element.querySelector("#art-approve").onclick = async (ev) => {
      ev.currentTarget.disabled = true;
      try {
        await request("teacher/moderate", {
          id: data.activity.id,
          ids: [image.id],
          status: image.approval_status === "approved" ? "hidden" : "approved",
        });
        modal.close();
        await onChange();
      } catch (error) {
        toast(error.message, "error");
        ev.target.closest("button").disabled = false;
      }
    };
    modal.element.querySelector("#art-delete").onclick = () =>
      confirmDialog({
        title: "이 이미지를 삭제할까요?",
        message:
          "이미지 파일을 삭제합니다. 학생의 문학 분석 기록은 유지됩니다.",
        confirm: "이미지 삭제",
        danger: true,
        onConfirm: async () => {
          await request("teacher/delete-images", {
            id: data.activity.id,
            ids: [image.id],
          });
          await onChange();
        },
      });
  }
}
export function compareArt(images, data) {
  openModal({
    title: images.every((image) => image.image_type === "character")
      ? "같은 인물, 서로 다른 해석"
      : "같은 이야기, 서로 다른 장면",
    eyebrow: "TWO PERSPECTIVES, ONE STORY",
    wide: true,
    body: `<div class="comparison-grid">${images
      .map((image) => {
        const w =
          data.worksheets.find((w) => w.id === image.worksheet_id) || {};
        const scene = image.image_type === "scene";
        return `<article><img src="${e(artworkSource(image.image_url))}" alt="${e(image.one_line_description)}"/><div class="between"><h3>${e(scene ? w.scene?.name : w.character_name)}</h3><span class="muted">${e(w.student_label)}</span></div><div class="chip-row">${image.hashtags.map((t) => `<span class="tag">#${e(t)}</span>`).join("")}</div><p>${e(image.one_line_description)}</p><span class="eyebrow">${scene ? "사건을 선택한 이유" : "인물 해석"}</span><p>${e(scene ? w.scene?.reason : w.personality_description)}</p><span class="eyebrow">작품 속 근거</span><p>${e(scene ? w.scene?.development : w.textual_evidence)}</p><p>${e(scene ? w.scene?.visual : w.evidence_explanation)}</p></article>`;
      })
      .join("")}</div>`,
    footer:
      '<p class="muted" style="font-size:12px">같은 행동을 다르게 읽은 부분은 무엇인가요? 원작의 근거를 함께 이야기해 보세요.</p>',
  });
  refreshIcons();
}
