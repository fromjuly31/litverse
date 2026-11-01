import { teacherShell, pageHeading } from "./teacher.js";
import { icon } from "../components/ui.js";
import { e } from "../utils/helpers.js";
import { STAGES } from "../utils/domain.js";
import { isDemo } from "../services/api.js";

function lessonCard(activity) {
  const base = `/teacher/activity/${e(activity.id)}`;
  return `<a class="lesson-card" href="${base}/background" aria-label="${e(activity.title)} 수업 열기" data-lesson-id="${e(activity.id)}">
    <div class="between"><span class="lesson-book">${icon("book-open")}</span><span class="badge ${["DRAFT", "CLOSED"].includes(activity.stage) ? "" : "blue"}">${e(STAGES[activity.stage])}</span></div>
    <div class="lesson-card-copy"><p class="lesson-course">${e(activity.course_name || "문학 수업")}</p><h3>${e(activity.title)}</h3><p class="lesson-meta">${e(activity.author)} · ${e(activity.class_name || "학급 미지정")}</p></div>
    <div class="lesson-card-footer"><span>${icon("lock-keyhole")} 비밀번호로 보호 중</span><span class="text-link lesson-card-open">수업 열기 ${icon("arrow-up-right")}</span></div>
  </a>`;
}

export function dashboard(root, activities) {
  const ongoing = activities
    .filter((activity) => !activity.finalized_at)
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at) -
        new Date(a.updated_at || a.created_at),
    );
  teacherShell(
    root,
    "classroom",
    null,
    `${pageHeading("THE CLASSROOM", "우리의 문학 수업", "새로운 작품으로 시작하거나, 진행 중인 수업을 이어가세요.", `<a class="btn primary" href="/teacher/activities/new">${icon("plus")} 수업 만들기</a>`)}
    <section aria-labelledby="lessons-heading"><div class="section-heading lesson-list-heading"><h2 id="lessons-heading">진행 중인 수업 <span class="lesson-count">${ongoing.length}</span></h2></div><div class="lesson-grid">${
      ongoing.map(lessonCard).join("") ||
      `<div class="lesson-empty"><span class="lesson-book">${icon("book-open")}</span><h3>첫 번째 수업을 만들어 보세요.</h3><p>위의 ‘수업 만들기’에서 작품과 수업 비밀번호를 정하면 시작할 수 있어요.</p></div>`
    }</div></section>
    ${isDemo ? '<p class="classroom-note">데모 수업 · 변경 사항은 이 브라우저에 저장됩니다.</p>' : ""}`,
  );
}
