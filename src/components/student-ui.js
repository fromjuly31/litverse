import { logo, icon, refreshIcons, initSelects, toast } from "./ui.js";
import { e } from "../utils/helpers.js";
import { normalizeTags } from "../utils/domain.js";
import { isDemo } from "../services/api.js";
export function studentShell(root, a, content) {
  root.innerHTML = `<div class="student-shell"><header class="student-topbar">${logo()}<div class="student-context"><span>${e(a.title)} · ${e(a.author)}</span><span class="badge">배경 · 인물 · 사건</span></div></header>${isDemo ? '<div class="student-demo">데모 체험 · 작성 내용은 이 브라우저에만 저장됩니다.</div>' : ""}<main id="main">${content}</main><footer class="student-footer">ONE STORY. INFINITE PERSPECTIVES.</footer></div>`;
  refreshIcons();
  initSelects(root);
}
export function backgroundSummary(a) {
  return !a.temporal_background && !a.spatial_background
    ? ""
    : `<details class="background-summary"><summary>${icon("book-open")} 함께 정리한 작품의 배경 ${icon("chevron-down")}</summary><div class="background-summary-grid"><article><span class="eyebrow">시간적 배경</span><p>${e(a.temporal_background || "아직 정리하지 않았어요.")}</p></article><article><span class="eyebrow">공간적 배경</span><p>${e(a.spatial_background || "아직 정리하지 않았어요.")}</p></article></div></details>`;
}
export function twoTabs(active, done = {}) {
  return `<div class="work-tabs" role="tablist" aria-label="인물과 사건 활동">${[
    ["character", "인물의 성격"],
    ["scene", "인상 깊은 사건"],
  ]
    .map(
      ([key, label], i) =>
        `<button type="button" role="tab" id="${key}-tab" aria-selected="${active === key}" aria-controls="student-work-panel" tabindex="${active === key ? 0 : -1}" data-work-tab="${key}"><span class="tab-number">0${i + 1}</span><span>${label}</span>${done[key] ? icon("check-circle-2") : ""}</button>`,
    )
    .join("")}</div>`;
}
export function bindTabs(root, onChange) {
  root.querySelectorAll("[data-work-tab]").forEach((btn) => {
    btn.onclick = () => onChange(btn.dataset.workTab);
    btn.onkeydown = (ev) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(ev.key)) return;
      ev.preventDefault();
      const next =
        ev.key === "Home"
          ? "character"
          : ev.key === "End"
            ? "scene"
            : btn.dataset.workTab === "character"
              ? "scene"
              : "character";
      onChange(next);
      root.querySelector(`[data-work-tab="${next}"]`)?.focus();
    };
  });
}
export function bindTagPicker(container, { tags, suggestions, max, onChange }) {
  const draw = () => {
    const all = [...new Set([...suggestions, ...tags])];
    container.innerHTML = `<div class="chip-row">${all.map((t) => `<button type="button" class="tag-button ${tags.includes(t) ? "active" : ""}" data-pick-tag="${e(t)}" aria-pressed="${tags.includes(t)}">#${e(t)}</button>`).join("")}</div><div class="tag-add"><input aria-label="새 성격 키워드" maxlength="20" placeholder="나만의 키워드"/><button type="button" class="btn secondary" aria-label="새 키워드 추가">${icon("plus")}</button></div><small class="muted">${tags.length} / ${max}개 선택</small>`;
    refreshIcons();
    const input = container.querySelector("input");
    const add = () => {
      const tag = normalizeTags([input.value])[0];
      if (!tag) {
        toast("20자 이내의 한글, 영문, 숫자로 입력해 주세요.", "error");
        return;
      }
      if (tags.includes(tag)) {
        input.value = "";
        return;
      }
      if (tags.length >= max) {
        toast(`최대 ${max}개까지 선택할 수 있어요.`, "error");
        return;
      }
      tags.push(tag);
      onChange([...tags]);
      draw();
      container.querySelector("input").focus();
    };
    container.querySelector(".tag-add button").onclick = add;
    input.onkeydown = (ev) => {
      if (ev.key === "Enter" && !ev.isComposing) {
        ev.preventDefault();
        add();
      }
    };
  };
  container.onclick = (ev) => {
    const tag = ev.target.closest("[data-pick-tag]")?.dataset.pickTag;
    if (!tag) return;
    if (tags.includes(tag)) tags = tags.filter((t) => t !== tag);
    else if (tags.length < max) tags.push(tag);
    else {
      toast(`최대 ${max}개까지 선택할 수 있어요.`, "error");
      return;
    }
    onChange([...tags]);
    draw();
  };
  draw();
}
