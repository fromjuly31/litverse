import { request, subscribe } from "./api.js";
import { e } from "../utils/helpers.js";
import { refreshIcons } from "../components/ui.js";

// Announce the teacher's next activity without replacing a student's editor.
export function watchStudentPhase(root, activity, token) {
  let stopped = false,
    busy = false,
    latest = activity;
  function show() {
    const shell = root.querySelector(".student-shell");
    if (!shell) return;
    let notice = shell.querySelector(".student-phase-notice");
    if (!latest.deepening_session_id) return;
    const inDeep = !!root.querySelector(".deep-student");
    const wantsDeep = latest.active_phase === "deepening";
    if (inDeep && (wantsDeep || latest.lesson_kind === "deepening")) {
      notice?.remove();
      return;
    }
    if (!inDeep && !wantsDeep) {
      notice?.remove();
      return;
    }
    const mode = wantsDeep ? "deepening" : "understanding";
    if (notice?.dataset.mode === mode) return;
    if (!notice) {
      notice = document.createElement("aside");
      notice.className = "student-phase-notice";
      notice.setAttribute("role", "status");
      shell.querySelector("main").before(notice);
    }
    notice.dataset.mode = mode;
    notice.innerHTML = `<span>선생님이 ${wantsDeep ? "이해 심화하기" : "작품 파악하기"}를 안내하고 있어요. 작성 내용은 이 기기에 임시저장됩니다.</span><a class="btn secondary small" href="/activity/${e(token)}/${mode}">${wantsDeep ? "심화 활동으로 이동" : "작품 파악으로 이동"}</a>`;
    refreshIcons();
  }
  const sync = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const next = await request("student/activity", { token });
      if (!stopped) {
        latest = next;
        show();
      }
    } finally {
      busy = false;
    }
  };
  const observer = new MutationObserver(show);
  observer.observe(root, { childList: true, subtree: true });
  show();
  const unsub = subscribe(activity.id, () => sync().catch(() => {}));
  const timer = setInterval(() => sync().catch(() => {}), 15000);
  return () => {
    stopped = true;
    observer.disconnect();
    unsub();
    clearInterval(timer);
  };
}
