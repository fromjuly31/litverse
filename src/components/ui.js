import { prepareRouteLinks } from "../utils/paths.js";
import {
  createIcons,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  X,
  ChevronDown,
  Check,
  BookOpen,
  LayoutDashboard,
  Library,
  Images,
  ChartNoAxesCombined,
  Settings,
  QrCode,
  Search,
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  Copy,
  Download,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  SlidersHorizontal,
  MoreHorizontal,
  CheckCheck,
  LogOut,
  Menu,
  Users,
  Clock,
  Sparkles,
  FileText,
  CircleHelp,
  PanelLeftClose,
  ExternalLink,
  MoveUp,
  MoveDown,
  CheckCircle2,
  Circle,
  ImagePlus,
  WifiOff,
  GraduationCap,
  ChevronRight,
  LockKeyhole,
  LoaderCircle,
  ArrowDown,
  Info,
} from "lucide";
import { e } from "../utils/helpers.js";
const icons = {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  X,
  ChevronDown,
  Check,
  BookOpen,
  LayoutDashboard,
  Library,
  Images,
  ChartNoAxesCombined,
  Settings,
  QrCode,
  Search,
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  Copy,
  Download,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  SlidersHorizontal,
  MoreHorizontal,
  CheckCheck,
  LogOut,
  Menu,
  Users,
  Clock,
  Sparkles,
  FileText,
  CircleHelp,
  PanelLeftClose,
  ExternalLink,
  MoveUp,
  MoveDown,
  CheckCircle2,
  Circle,
  ImagePlus,
  WifiOff,
  GraduationCap,
  ChevronRight,
  LockKeyhole,
  LoaderCircle,
  ArrowDown,
  Info,
};
export const icon = (name, cls = "") =>
  `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
export const refreshIcons = () => {
  prepareRouteLinks();
  createIcons({ icons, attrs: { "stroke-width": 1.65 } });
};
export const logo = () =>
  `<a href="/" class="brand" aria-label="LITVERSE 처음으로">Litverse<span class="brand-dot">.</span></a>`;
export const button = (label, ico, cls = "secondary", attrs = "") =>
  `<button type="button" class="btn ${cls}" ${attrs}>${ico ? icon(ico) : ""}<span>${label}</span></button>`;
export function toast(message, type = "success") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.innerHTML = `${icon(type === "error" ? "circle-help" : "check-circle-2")}<span>${e(message)}</span>`;
  document.querySelector("#toasts").append(item);
  refreshIcons();
  setTimeout(() => item.remove(), 5000);
}
export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast("클립보드에 복사했어요.");
  } catch {
    openModal({
      title: "텍스트 복사",
      body: `<p class="muted">아래 텍스트를 선택해 복사해 주세요.</p><textarea class="copy-fallback" readonly>${e(value)}</textarea>`,
    });
  }
}
let activeModal;
let selectClose;
export function closeOverlays() {
  selectClose?.();
  activeModal?.close();
}
export function openModal({
  title,
  eyebrow = "",
  body,
  footer = "",
  wide = false,
  className = "",
  onClose,
} = {}) {
  selectClose?.();
  activeModal?.close();
  const previous = document.activeElement;
  const overlay = document.createElement("div");
  overlay.className = `modal-overlay ${className}`;
  overlay.innerHTML = `<section class="modal ${wide ? "modal-wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><header class="modal-head"><div>${eyebrow ? `<span class="eyebrow">${e(eyebrow)}</span>` : ""}<h2 id="modal-title">${e(title)}</h2></div><button type="button" class="icon-btn modal-close" aria-label="닫기">${icon("x")}</button></header><div class="modal-body">${body}</div>${footer ? `<footer class="modal-footer">${footer}</footer>` : ""}</section>`;
  const oldOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.querySelector("#app").inert = true;
  document.querySelector("#overlays").append(overlay);
  initPasswordFields(overlay);
  const focusable = () =>
    [
      ...overlay.querySelectorAll(
        'button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
      ),
    ].filter((el) => el.getClientRects().length && !el.closest("[hidden]"));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    selectClose?.();
    overlay.remove();
    document.body.style.overflow = oldOverflow;
    document.querySelector("#app").inert = false;
    document.removeEventListener("keydown", keydown);
    activeModal = null;
    onClose?.();
    if (previous?.isConnected) previous.focus();
  };
  const keydown = (event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      close();
    }
    if (event.key !== "Tab") return;
    const els = focusable();
    const first = els[0];
    const last = els.at(-1);
    if (!els.length) {
      event.preventDefault();
      overlay.querySelector(".modal").focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", keydown);
  overlay.querySelector(".modal-close").onclick = close;
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay || ev.target.closest("[data-close-modal]"))
      close();
  });
  refreshIcons();
  requestAnimationFrame(() =>
    (
      overlay.querySelector("[autofocus]") ||
      focusable()[0] ||
      overlay.querySelector(".modal")
    ).focus(),
  );
  activeModal = { element: overlay, close };
  return activeModal;
}
export function confirmDialog({
  title,
  message,
  confirm = "확인",
  danger = false,
  onConfirm,
  typed,
}) {
  const modal = openModal({
    title,
    body: `<p class="dialog-copy">${e(message)}</p>${typed ? `<label class="field">확인을 위해 ‘${e(typed)}’을 입력해 주세요.<input id="confirm-typed" autocomplete="off"/></label>` : ""}`,
    footer: `${button("취소", null, "secondary", "data-close-modal")}${button(confirm, danger ? "trash-2" : "check", danger ? "danger" : "primary", `id="confirm-action" ${typed ? "disabled" : ""}`)}`,
  });
  const action = modal.element.querySelector("#confirm-action");
  modal.element
    .querySelector("#confirm-typed")
    ?.addEventListener(
      "input",
      (ev) => (action.disabled = ev.target.value !== typed),
    );
  action.onclick = async () => {
    action.disabled = true;
    try {
      await onConfirm();
      modal.close();
    } catch (error) {
      toast(error.message, "error");
      action.disabled = false;
    }
  };
}
let selectId = 0;
export function customSelect({
  name = "",
  label,
  value = "",
  options,
  className = "",
}) {
  const id = `select-${++selectId}`;
  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  const selected = normalized.find((o) => o.value === value) || normalized[0];
  return `<div class="custom-select ${className}" data-select><input type="hidden" name="${e(name)}" value="${e(selected?.value ?? "")}"/><button type="button" class="select-trigger" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-controls="${id}" aria-label="${e(label)}"><span>${e(selected?.label || label)}</span>${icon("chevron-down")}</button><div id="${id}" class="select-menu" role="listbox" aria-label="${e(label)}" hidden>${normalized.map((o, i) => `<button type="button" class="select-option" role="option" id="${id}-${i}" data-value="${e(o.value)}" aria-selected="${o.value === selected?.value}" tabindex="-1">${e(o.label)}${icon("check")}</button>`).join("")}</div></div>`;
}
export function initSelects(root = document) {
  root.querySelectorAll("[data-select]").forEach((wrapper) => {
    if (wrapper.dataset.ready) return;
    wrapper.dataset.ready = "true";
    const trigger = wrapper.querySelector(".select-trigger");
    const menu = wrapper.querySelector(".select-menu");
    const input = wrapper.querySelector("input");
    const options = [...menu.querySelectorAll('[role="option"]')];
    let active = 0;
    let prefix = "";
    let prefixTimer;
    const highlight = (index) => {
      active = (index + options.length) % options.length;
      options.forEach((o, i) =>
        o.classList.toggle("highlighted", i === active),
      );
      trigger.setAttribute("aria-activedescendant", options[active].id);
      const item = options[active];
      if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop;
      else if (
        item.offsetTop + item.offsetHeight >
        menu.scrollTop + menu.clientHeight
      )
        menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight;
    };
    const close = () => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-activedescendant");
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", onScroll, true);
      if (selectClose === close) selectClose = null;
      clearTimeout(prefixTimer);
      prefix = "";
    };
    const outside = (ev) => {
      if (!wrapper.contains(ev.target)) close();
    };
    const onScroll = (ev) => {
      if (!menu.contains(ev.target)) position();
    };
    const position = () => {
      const r = trigger.getBoundingClientRect();
      const vh = window.visualViewport?.height || innerHeight;
      const width = Math.min(Math.max(r.width, 190), innerWidth - 24);
      const spaceBelow = vh - r.bottom - 12;
      const spaceAbove = r.top - 12;
      const upward =
        spaceBelow < Math.min(menu.scrollHeight, 220) &&
        spaceAbove > spaceBelow;
      const available = Math.max(60, upward ? spaceAbove : spaceBelow);
      Object.assign(menu.style, {
        width: `${width}px`,
        left: `${Math.max(12, Math.min(r.left, innerWidth - width - 12))}px`,
        maxHeight: `${Math.min(300, available)}px`,
        top: upward ? "auto" : `${r.bottom + 6}px`,
        bottom: upward ? `${innerHeight - r.top + 6}px` : "auto",
      });
    };
    const open = () => {
      selectClose?.();
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      position();
      highlight(
        Math.max(
          0,
          options.findIndex((o) => o.dataset.value === input.value),
        ),
      );
      selectClose = close;
      document.addEventListener("pointerdown", outside, true);
      window.addEventListener("resize", position);
      window.addEventListener("scroll", onScroll, true);
    };
    const choose = (index) => {
      input.value = options[index].dataset.value;
      trigger.querySelector("span").textContent =
        options[index].textContent.trim();
      options.forEach((o, i) => o.setAttribute("aria-selected", i === index));
      close();
      trigger.focus();
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    trigger.onclick = () => (menu.hidden ? open() : close());
    options.forEach((o, i) => {
      o.onclick = () => choose(i);
      o.onpointermove = () => highlight(i);
    });
    trigger.addEventListener("keydown", (ev) => {
      const isOpen = !menu.hidden;
      if (
        [
          "ArrowDown",
          "ArrowUp",
          "Home",
          "End",
          "Enter",
          " ",
          "Escape",
        ].includes(ev.key)
      ) {
        ev.preventDefault();
        if (ev.key === "Escape") {
          if (isOpen) {
            ev.stopPropagation();
            close();
          }
          return;
        }
        if (!isOpen) {
          open();
          return;
        }
        if (ev.key === "Enter" || ev.key === " ") choose(active);
        else
          highlight(
            ev.key === "Home"
              ? 0
              : ev.key === "End"
                ? options.length - 1
                : active + (ev.key === "ArrowDown" ? 1 : -1),
          );
      } else if (ev.key === "Tab") close();
      else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey) {
        if (!isOpen) open();
        prefix += ev.key;
        clearTimeout(prefixTimer);
        prefixTimer = setTimeout(() => (prefix = ""), 650);
        const idx = options.findIndex((o) =>
          o.textContent
            .trim()
            .toLocaleLowerCase()
            .startsWith(prefix.toLocaleLowerCase()),
        );
        if (idx >= 0) highlight(idx);
      }
    });
  });
}
export function field(
  label,
  name,
  value = "",
  {
    area = false,
    required = false,
    hint = "",
    type = "text",
    max = 2000,
    placeholder = "",
    minLength,
    autocomplete = "",
  } = {},
) {
  const hintId = `field-hint-${++selectId}`;
  const controlId = `field-control-${selectId}`;
  const attrs = `id="${controlId}" aria-label="${e(label)}" ${hint ? `aria-describedby="${hintId}"` : ""} ${minLength !== undefined ? `minlength="${minLength}"` : ""} ${autocomplete ? `autocomplete="${e(autocomplete)}"` : ""}`;
  const input = `<input name="${e(name)}" ${attrs} type="${type}" value="${e(value)}" maxlength="${max}" placeholder="${e(placeholder)}" ${required ? "required" : ""}/>`;
  const control =
    type === "password"
      ? `<div class="password-input">${input}<button type="button" class="password-toggle" data-password-toggle aria-label="${e(label)} 표시" aria-pressed="false">${icon("eye")}</button></div>`
      : input;
  if (type === "password")
    return `<div class="field"><label for="${controlId}">${e(label)}${required ? '<b class="required" aria-hidden="true">*</b>' : ""}</label>${control}${hint ? `<small id="${hintId}">${e(hint)}</small>` : ""}</div>`;
  return `<label class="field"><span>${e(label)}${required ? '<b class="required" aria-hidden="true">*</b>' : ""}</span>${area ? `<textarea name="${e(name)}" ${attrs} maxlength="${max}" placeholder="${e(placeholder)}" ${required ? "required" : ""}>${e(value)}</textarea>` : control}${hint ? `<small id="${hintId}">${e(hint)}</small>` : ""}</label>`;
}
export function initPasswordFields(root) {
  root.querySelectorAll("[data-password-toggle]").forEach((toggle) => {
    toggle.onclick = () => {
      const input = toggle.previousElementSibling;
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      toggle.setAttribute("aria-pressed", String(visible));
      toggle.setAttribute(
        "aria-label",
        `${input.getAttribute("aria-label")} ${visible ? "숨기기" : "표시"}`,
      );
      toggle.innerHTML = icon(visible ? "eye-off" : "eye");
      refreshIcons();
    };
  });
}
export function formErrors(form) {
  let first;
  form.querySelectorAll("[required]").forEach((el) => {
    const invalid =
      !el.value.trim() ||
      (el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value));
    el.setAttribute("aria-invalid", invalid);
    el.closest(".field")?.querySelector(".field-error")?.remove();
    if (invalid) {
      first ||= el;
      const msg = document.createElement("small");
      msg.className = "field-error";
      msg.textContent = "입력 내용을 확인해 주세요.";
      el.closest(".field")?.append(msg);
    }
  });
  first?.focus();
  return !!first;
}
