import { teacherShell, pageHeading } from "./teacher.js";
import { icon, refreshIcons } from "../components/ui.js";
import { e } from "../utils/helpers.js";
import { STAGES } from "../utils/domain.js";
import { isDemo } from "../services/api.js";

function lessonCard(activity, index, mode) {
  const base = `/teacher/activity/${e(activity.id)}`;
  return `<a class="lesson-card" href="${base}/${mode === "deepening" ? "deepening" : "background"}" aria-label="${e(activity.title)} 수업 열기" data-lesson-id="${e(activity.id)}" data-tone="${index % 3}">
    <span class="lesson-cover" aria-hidden="true"><span class="lesson-cover-number">${String(index + 1).padStart(2, "0")}</span>${icon("book-open")}<span class="lesson-cover-rule"></span></span>
    <div class="lesson-card-copy"><div class="lesson-card-top"><span class="badge ${["DRAFT", "CLOSED"].includes(activity.stage) ? "" : "blue"}">${e(mode === "deepening" ? (activity.lesson_kind === "deepening" ? "독립 심화 수업" : "작품 파악과 연결") : STAGES[activity.stage])}</span>${icon("lock-keyhole")}</div><h3 title="${e(activity.title)}">${e(activity.title)}</h3><p class="lesson-meta" title="${e(activity.author)} · ${e(activity.course_name || "문학 수업")}">${e(activity.author)} · ${e(activity.course_name || "문학 수업")}</p><p class="lesson-course">${e(activity.introduction || "함께 읽고 해석하는 문학 수업")}</p></div>
    <span class="lesson-card-arrow" aria-hidden="true">${icon("arrow-up-right")}</span>
  </a>`;
}

export function dashboard(root, activities, mode = "understanding") {
  const ongoing = activities
    .filter((activity) =>
      mode === "deepening"
        ? !!activity.deepening_session_id
        : activity.lesson_kind !== "deepening" && !activity.finalized_at,
    )
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at) -
        new Date(a.updated_at || a.created_at),
    );
  teacherShell(
    root,
    mode === "deepening" ? "deepening-list" : "classroom",
    null,
    `${pageHeading("THE CLASSROOM", mode === "deepening" ? "문학에서 삶으로" : "우리의 문학 수업", mode === "deepening" ? "작품의 질문을 나의 삶과 연결하고, 다른 관점으로 생각을 넓혀요." : "새로운 작품으로 시작하거나, 진행 중인 수업을 이어가세요.", `<a class="btn primary" href="${mode === "deepening" ? "/teacher/deepening/new" : "/teacher/activities/new"}">${icon("plus")} ${mode === "deepening" ? "심화 수업 만들기" : "수업 만들기"}</a>`)}
    <section class="classroom-lessons" aria-labelledby="lessons-heading"><div class="section-heading lesson-list-heading"><h2 id="lessons-heading">${mode === "deepening" ? "나란히 깊어지는 수업" : "진행 중인 수업"} <span class="lesson-count">${ongoing.length}</span></h2></div><div class="lesson-grid" id="lesson-grid"></div></section>
    <div class="classroom-bottom">${isDemo ? '<p class="classroom-note">데모 수업 · 이 브라우저에 저장됩니다.</p>' : ""}<nav class="classroom-pagination" aria-label="수업 목록 페이지" hidden><button class="icon-btn" id="lessons-prev" aria-label="이전 수업 목록">${icon("arrow-left")}</button><span id="lessons-page" aria-live="polite"></span><button class="icon-btn" id="lessons-next" aria-label="다음 수업 목록">${icon("arrow-right")}</button></nav></div>`,
  );
  root.classList.add("classroom-overview");
  const grid = root.querySelector("#lesson-grid");
  const pagination = root.querySelector(".classroom-pagination");
  const previous = root.querySelector("#lessons-prev");
  const next = root.querySelector("#lessons-next");
  let page = 0,
    pageSize = 0,
    frame;
  const draw = (resizeOnly = false) => {
    const style = getComputedStyle(grid);
    const columns = style.gridTemplateColumns.split(" ").length;
    const rowHeight = parseFloat(style.gridAutoRows);
    const gap = parseFloat(style.rowGap) || 0;
    const rows = Math.max(
      1,
      Math.floor((grid.clientHeight + gap) / (rowHeight + gap)),
    );
    const nextPageSize = columns * rows;
    if (resizeOnly && nextPageSize === pageSize) return;
    if (pageSize && nextPageSize !== pageSize)
      page = Math.floor((page * pageSize) / nextPageSize);
    pageSize = nextPageSize;
    const pages = Math.max(1, Math.ceil(ongoing.length / pageSize));
    page = Math.min(page, pages - 1);
    grid.innerHTML =
      ongoing
        .slice(page * pageSize, (page + 1) * pageSize)
        .map((activity, index) =>
          lessonCard(activity, page * pageSize + index, mode),
        )
        .join("") ||
      `<div class="lesson-empty"><span class="lesson-book">${icon("book-open")}</span><div><h3>${mode === "deepening" ? "작품에서 시작되는, 나의 질문." : "첫 번째 수업을 만들어 보세요."}</h3><p>‘수업 만들기’에서 작품과 비밀번호를 정하면 시작할 수 있어요.</p></div></div>`;
    pagination.hidden = pages <= 1;
    previous.disabled = page === 0;
    next.disabled = page === pages - 1;
    root.querySelector("#lessons-page").textContent = `${page + 1} / ${pages}`;
    refreshIcons();
  };
  previous.onclick = () => {
    page--;
    draw();
  };
  next.onclick = () => {
    page++;
    draw();
  };
  // Layout becomes measurable after the route surface is attached.
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => draw(true));
  });
  observer.observe(grid);
  draw();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}
