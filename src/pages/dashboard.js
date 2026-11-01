import { teacherShell, pageHeading } from "./teacher.js";
import { icon } from "../components/ui.js";
import { e } from "../utils/helpers.js";
import { STAGES } from "../utils/domain.js";
import { isDemo } from "../services/api.js";

function lessonCard(activity) {
  const base = `/teacher/activity/${e(activity.id)}`;
  return `<article class="lesson-card ${activity.finalized_at ? "completed" : ""}" data-lesson-id="${e(activity.id)}">
    <div class="between"><span class="lesson-book">${icon("book-open")}</span><span class="badge ${["DRAFT", "CLOSED"].includes(activity.stage) ? "" : "blue"}">${activity.finalized_at ? "전시 완료" : e(STAGES[activity.stage])}</span></div>
    <div class="lesson-card-copy"><p class="lesson-course">${e(activity.course_name || "문학 수업")}</p><h3><a href="${base}/background">${e(activity.title)}</a></h3><p class="lesson-meta">${e(activity.author)} · ${e(activity.class_name || "학급 미지정")}</p><p class="lesson-description">${activity.finalized_at ? "함께 만든 해석이 한 장의 전시작으로 남았습니다." : "비밀번호를 입력하고 우리 수업을 이어갑니다."}</p></div>
    <div class="lesson-card-footer"><span>${icon(activity.finalized_at ? "images" : "lock-keyhole")} ${activity.finalized_at ? "완성된 수업" : "비밀번호로 보호 중"}</span>${activity.finalized_at ? `<a class="text-link" href="/exhibition/${e(activity.id)}">관람하기 ${icon("arrow-up-right")}</a><a class="text-link" href="${base}/background">다시 열기</a>` : `<a class="text-link" href="${base}/background" aria-label="${e(activity.title)} 수업 열기">수업 열기 ${icon("arrow-up-right")}</a>`}</div>
  </article>`;
}

export function dashboard(root, activities) {
  const sorted = [...activities].sort(
    (a, b) =>
      new Date(b.updated_at || b.created_at) -
      new Date(a.updated_at || a.created_at),
  );
  let lastId;
  try {
    lastId = localStorage.getItem("litverse-last-lesson");
  } catch {}
  const recent =
    sorted.find((a) => a.id === lastId && !a.finalized_at) ||
    sorted.find((a) => !a.finalized_at);
  const running = activities.filter(
    (a) => !["DRAFT", "CLOSED"].includes(a.stage),
  ).length;
  teacherShell(
    root,
    "dashboard",
    null,
    `
    ${pageHeading("MY LITERATURE CLASSROOM", "우리의 문학 수업", "작품 하나로 시작하는 수업. 배경을 읽고, 인물을 만나고, 사건을 해석해요.", `<a class="btn primary" href="/teacher/activities/new">${icon("plus")} 수업 만들기</a>`)}
    ${recent ? `<section class="lesson-resume" aria-labelledby="resume-heading"><div class="lesson-resume-copy"><span class="eyebrow">CONTINUE YOUR CLASS</span><h2 id="resume-heading">수업 이어가기</h2><p>만들어 둔 수업을 열고, 우리 반의 해석을 이어가세요.</p></div><div class="lesson-resume-work"><span class="badge">${e(STAGES[recent.stage])}</span><h3>${e(recent.title)}</h3><p>${e(recent.author)} · ${e(recent.class_name || "학급 미지정")}</p></div><a class="btn primary" href="/teacher/activity/${e(recent.id)}/background" aria-label="${e(recent.title)} 수업 이어가기">수업 이어가기 ${icon("arrow-right")}</a></section>` : `<section class="lesson-empty"><span class="lesson-book">${icon("book-open")}</span><h2>첫 번째 수업을 만들어 보세요.</h2><p>작품과 수업 설정을 저장하면<br/>배경 탐구·등장인물 갤러리·사건 분석이 준비됩니다.</p><a class="btn primary" href="/teacher/activities/new">${icon("plus")} 첫 수업 만들기</a></section>`}
    <section aria-labelledby="lessons-heading"><div class="section-heading lesson-list-heading"><div><h2 id="lessons-heading">진행 중인 수업 <span class="lesson-count">${sorted.filter((a) => !a.finalized_at).length}</span></h2><p>준비 중인 수업부터 마무리를 기다리는 수업까지, 이어서 진행하세요.</p></div></div><div class="lesson-grid">${
      sorted
        .filter((a) => !a.finalized_at)
        .map(lessonCard)
        .join("") ||
      '<p class="lesson-section-empty">진행 중인 수업이 없습니다. 새 작품으로 시작해 보세요.</p>'
    }</div></section>
    <section aria-labelledby="completed-heading"><div class="section-heading lesson-list-heading"><div><h2 id="completed-heading">완료된 수업 <span class="lesson-count">${sorted.filter((a) => a.finalized_at).length}</span></h2><p>두 장의 최종본으로 완성한 포스터가 전시관에 보관되어 있습니다.</p></div><a class="text-link" href="/exhibition">문학 전시관 관람 ${icon("arrow-up-right")}</a></div><div class="lesson-grid completed-lesson-grid">${
      sorted
        .filter((a) => a.finalized_at)
        .map(lessonCard)
        .join("") ||
      '<p class="lesson-section-empty">첫 번째 완성작을 기다리고 있어요.</p>'
    }</div></section>
    <footer class="dashboard-footer"><span>${isDemo ? "데모 수업 · 변경 사항은 이 브라우저에 저장됩니다." : "작품을 함께 읽고, 서로 다른 해석을 나눠 보세요."}</span><span>ONE STORY. MANY PERSPECTIVES.</span></footer>
  `,
  );
}
