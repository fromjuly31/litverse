import { request } from "../services/api.js";
import { e } from "../utils/helpers.js";
import { museumHeader, museumFooter } from "../components/museum-shell.js";
import { icon, openModal, refreshIcons } from "../components/ui.js";
import {
  analysisSummary,
  perspectiveCards,
  recordDetail,
} from "../components/deepening.js";

export function deepeningFrame(exhibit) {
  const first = exhibit.records[0];
  return `<article class="exhibit-card"><a class="exhibit-frame deep-exhibit-frame" href="/exhibition/deep-${e(exhibit.id)}" aria-label="${e(exhibit.title)} 심화 전시 자세히 보기"><div class="deep-exhibit-mat"><span class="eyebrow">DEEPER READING · ${exhibit.round}회차</span><h2>${e(exhibit.title)}</h2><p>${e(exhibit.author)} 원작</p><div class="deep-exhibit-thought"><span>BEFORE</span><p>${e(first?.initial?.choice || "작품에서 시작된 질문")}</p><span>AFTER</span><p>${e(first?.reflection?.answer || "서로 다른 생각이 깊어지는 곳")}</p></div><span class="deep-exhibit-count">${exhibit.record_count ?? exhibit.records.length}개의 성찰 ${icon("arrow-up-right")}</span></div></a><div class="exhibit-label"><div><h2>${e(exhibit.title)}</h2><p>이해 심화 전시 · ${exhibit.round}회차</p></div><span class="exhibit-signature">함께 읽은 우리</span></div></article>`;
}
export async function deepeningExhibit(root, sessionId) {
  const exhibit = await request("deepening/public-exhibit", {
    session_id: sessionId,
  });
  root.innerHTML = `${museumHeader()}<main id="main" class="collection-page deep-public-detail"><a class="text-link" href="/exhibition?type=deepening">${icon("arrow-left")} 전시관으로</a><header class="collection-title"><span class="eyebrow">THOUGHTS IN DIALOGUE</span><h1>${e(exhibit.title)}</h1><p>${e(exhibit.author)} 원작 · 이해 심화 ${exhibit.round}회차</p><span class="collection-total">${exhibit.records.length}개의 성찰</span></header>${analysisSummary(exhibit.analysis)}<section><h2>처음의 생각, 깊어진 시선.</h2><p class="muted">같은 생각을 유지하거나 다른 관점으로 넓어지는 과정 모두를 함께 읽어 보세요.</p>${perspectiveCards(exhibit.records)}</section><a class="btn secondary" href="/teacher/activity/${e(exhibit.activity_id)}/deepening">수업 관리 ${icon("lock-keyhole")}</a></main>${museumFooter()}`;
  root.querySelectorAll("[data-record]").forEach(
    (button) =>
      (button.onclick = () => {
        const record = exhibit.records.find(
          (r) => r.id === button.dataset.record,
        );
        openModal({
          title: `${exhibit.title} · ${record.display_name}`,
          body: recordDetail(record),
          wide: true,
        });
      }),
  );
  refreshIcons();
}
