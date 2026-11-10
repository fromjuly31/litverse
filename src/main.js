import "./styles/main.css";
import "./styles/responsive.css";
import "./styles/learning.css";
import "./styles/museum.css";
import "./styles/lessons.css";
import "./styles/poster.css";
import "./styles/archive.css";
import "./styles/entrance.css";
import "./styles/screens.css";
import "./styles/deepening.css";
import "./styles/editor.css";
import { museumHeader } from "./components/museum-shell.js";
import { museumHome, exhibitionPage } from "./pages/museum.js";
import { adminPage } from "./pages/lesson-access.js";
import {
  closeOverlays,
  refreshIcons,
  initSelects,
  initPasswordFields,
  icon,
  toast,
  button,
} from "./components/ui.js";
import { e } from "./utils/helpers.js";
import {
  currentRoute,
  hashRouting,
  routeHref,
  routeFromLink,
} from "./utils/paths.js";
import { loginPage } from "./pages/public.js";
import { teacherPage } from "./pages/teacher.js";
import { studentPage } from "./pages/student.js";
import { showcasePage } from "./pages/showcase.js";
const app = document.querySelector("#app");
let cleanup;
let renderId = 0;
export async function navigate(path, replace = false) {
  if (path !== currentRoute())
    history[replace ? "replaceState" : "pushState"]({}, "", routeHref(path));
  await render();
}
export async function render() {
  const id = ++renderId;
  cleanup?.();
  cleanup = null;
  closeOverlays();
  window.scrollTo(0, 0);
  const path = currentRoute().split("?")[0];
  const museumRoute =
    path === "/" || /^\/(teacher|exhibition|admin|login)(\/|$)/.test(path);
  const surface = document.createElement("div");
  if (museumRoute) surface.classList.add("museum-screen");
  app.replaceChildren(surface);
  surface.innerHTML = `${museumRoute ? museumHeader() : ""}<div class="loading-page"><div class="flex">${icon("loader-circle")}<span>문학의 또 다른 시선을 준비하고 있어요.</span></div></div>`;
  refreshIcons();
  try {
    let dispose;
    if (path === "/") dispose = await museumHome(surface);
    else if (["/admin", "/admin/login", "/login"].includes(path))
      dispose = await adminPage(surface);
    else if (path === "/exhibition" || /^\/exhibition\/[^/]+$/.test(path))
      dispose = await exhibitionPage(surface, path.split("/")[2]);
    else if (path.startsWith("/teacher"))
      dispose = await teacherPage(surface, path);
    else if (path.startsWith("/activity/") || path.startsWith("/submit/"))
      dispose = await studentPage(surface, path);
    else
      surface.innerHTML = `<main id="main" class="auth-page"><div class="empty"><h1>페이지를 찾을 수 없어요.</h1><p>링크를 다시 확인해 주세요.</p><a class="btn primary" href="/">처음으로 돌아가기</a></div></main>`;
    if (id !== renderId) {
      dispose?.();
      return;
    }
    cleanup = dispose;
    refreshIcons();
    initSelects(surface);
    initPasswordFields(surface);
    surface.querySelector("main")?.setAttribute("tabindex", "-1");
  } catch (error) {
    if (id !== renderId) return;
    surface.innerHTML = `<main id="main" class="auth-page"><div class="empty"><h2>화면을 열지 못했어요.</h2><p>${e(error.message)}</p><div class="flex wrap" style="justify-content:center;margin-top:20px">${button("다시 시도", "rotate-ccw", "primary", 'id="retry-page"')}<a class="btn secondary" href="/">처음으로</a></div></div></main>`;
    surface.querySelector("#retry-page").onclick = render;
    refreshIcons();
  }
}
document.addEventListener("click", (ev) => {
  const link = ev.target.closest("a[href]");
  if (
    !link ||
    link.target ||
    link.download ||
    ev.metaKey ||
    ev.ctrlKey ||
    ev.shiftKey ||
    ev.altKey ||
    ev.button !== 0
  )
    return;
  if (hashRouting && link.getAttribute("href") === "#main") {
    ev.preventDefault();
    document.getElementById("main")?.focus();
    document.getElementById("main")?.scrollIntoView();
    return;
  }
  const path = routeFromLink(link);
  if (!path) return;
  ev.preventDefault();
  navigate(path);
});
window.addEventListener(hashRouting ? "hashchange" : "popstate", render);
window.addEventListener("offline", () =>
  toast(
    "인터넷 연결이 끊겼어요. 작성 중인 내용은 이 기기에 임시저장됩니다.",
    "error",
  ),
);
window.addEventListener("online", () => toast("인터넷에 다시 연결되었어요."));
const updateViewport = () => {
  const v = window.visualViewport;
  document.documentElement.style.setProperty(
    "--keyboard-inset",
    `${v ? Math.max(0, innerHeight - v.height - v.offsetTop) : 0}px`,
  );
};
window.visualViewport?.addEventListener("resize", updateViewport);
updateViewport();
document.addEventListener("focusin", (event) => {
  if (
    innerWidth <= 520 &&
    event.target.matches(
      ".student-shell textarea,.student-shell input:not([type=hidden]):not([type=file])",
    )
  )
    requestAnimationFrame(() => {
      if (event.target.isConnected)
        event.target.scrollIntoView({ block: "center", behavior: "instant" });
    });
});
render();
