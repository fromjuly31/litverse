import { e } from "../utils/helpers.js";
import { icon, openModal } from "../components/ui.js";
import {
  analysisSummary,
  perspectiveCards,
  recordDetail,
} from "../components/deepening.js";

export function perspectiveCover(work) {
  return `<div class="deep-exhibit-mat">${icon("book-open")}<h2>${e(work.title)}</h2><p>${e(work.author)} 원작</p></div>`;
}

export function perspectivesSection(exhibits) {
  if (!exhibits.length) return "";
  return `<section class="work-perspectives" aria-labelledby="work-perspectives-heading">
    <h2 id="work-perspectives-heading">이해 심화</h2>
    ${exhibits
      .map(
        (exhibit) => `<div class="work-perspective-round">
      ${exhibits.length > 1 ? `<h3>${exhibit.round}회차</h3>` : ""}
      ${analysisSummary(exhibit.analysis)}
      ${perspectiveCards(exhibit.records)}
      <a class="text-link" href="/teacher/activity/${e(exhibit.activity_id)}/deepening/${e(exhibit.id)}">${icon("lock-keyhole")} 심화 수업 열기</a>
    </div>`,
      )
      .join("")}
  </section>`;
}

export function bindPublicPerspectives(root, exhibits) {
  const records = new Map(
    exhibits.flatMap((exhibit) =>
      exhibit.records.map((record) => [
        record.id,
        { record, title: exhibit.title },
      ]),
    ),
  );
  root
    .querySelectorAll(".work-perspectives [data-record]")
    .forEach((button) => {
      button.onclick = () => {
        const { record, title } = records.get(button.dataset.record);
        openModal({
          title: `${title} · ${record.display_name}`,
          body: recordDetail(record),
          wide: true,
        });
      };
    });
}
