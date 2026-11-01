import { field, button, toast, confirmDialog } from "./ui.js";
import { request } from "../services/api.js";

export const synopsisPanel = (value = "", save = false) =>
  `<section class="panel synopsis-panel"><div class="synopsis-heading"><div><span class="eyebrow">BEFORE THE STORY BEGINS</span><h2>작품의 줄거리</h2></div>${button("AI 줄거리 요약", "sparkles", "secondary", "data-generate-synopsis")}</div>${field("작품 줄거리", "synopsis", value, { area: true, max: 1800, placeholder: "제목과 원작 작가를 입력하면 짧은 줄거리 초안을 준비합니다. 원문을 확인한 뒤 자유롭게 다듬어 주세요." })}<p class="synopsis-note" role="status">AI가 작성한 내용은 원문과 대조해 확인해 주세요.</p>${save ? button("줄거리 저장", "check", "primary", "data-save-synopsis") : ""}</section>`;

export function bindSynopsis(root, getWork, id) {
  const panel = root.querySelector(".synopsis-panel"),
    input = panel.querySelector("[name=synopsis]"),
    note = panel.querySelector(".synopsis-note"),
    generate = panel.querySelector("[data-generate-synopsis]");
  let lastKey = "",
    busy = false;
  const run = async (automatic = false, approved = false) => {
    const work = getWork(),
      key = `${work.title}|${work.author}`;
    if (
      !work.title?.trim() ||
      !work.author?.trim() ||
      busy ||
      (automatic && (input.value.trim() || key === lastKey))
    )
      return;
    if (!automatic && !approved && input.value.trim()) {
      confirmDialog({
        title: "줄거리를 새 초안으로 바꿀까요?",
        message: "지금 작성한 줄거리를 새 요약으로 교체합니다.",
        confirm: "새 요약 받기",
        onConfirm: () => run(false, true),
      });
      return;
    }
    lastKey = key;
    busy = true;
    generate.disabled = true;
    const original = input.value;
    note.textContent = "작품의 줄거리 초안을 준비하고 있어요…";
    try {
      const result = await request("public/synopsis", work);
      if (!panel.isConnected) return;
      if (
        input.value !== original ||
        `${getWork().title}|${getWork().author}` !== key
      ) {
        note.textContent =
          "작성 중인 내용을 보호하기 위해 요약을 반영하지 않았어요.";
        return;
      }
      input.value = result.synopsis;
      note.textContent =
        result.note ||
        "AI가 작성한 초안입니다. 원문을 확인하고 필요하면 수정해 주세요.";
      if (id) {
        await request("teacher/synopsis", { id, synopsis: input.value });
        note.textContent += " 초안을 저장했어요.";
      }
    } catch (error) {
      if (panel.isConnected) note.textContent = error.message;
    } finally {
      busy = false;
      generate.disabled = false;
    }
  };
  generate.onclick = () => run();
  root
    .querySelectorAll("[name=title],[name=author]")
    .forEach((el) => el.addEventListener("blur", () => run(true)));
  panel
    .querySelector("[data-save-synopsis]")
    ?.addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      try {
        await request("teacher/synopsis", { id, synopsis: input.value });
        toast("줄거리를 저장했어요.");
      } catch (error) {
        note.textContent = error.message;
      } finally {
        btn.disabled = false;
      }
    });
  if (id && !input.value) run(true);
}
