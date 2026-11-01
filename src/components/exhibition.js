import { artworkSource } from "../utils/artwork.js";
import { e } from "../utils/helpers.js";
import { icon } from "./ui.js";
import { isDemo } from "../services/api.js";
import { STAGES } from "../utils/domain.js";

export function exhibitionFeature(data, base) {
  const activity = data.activity;
  const approved = data.images.filter(
    (image) => image.approval_status === "approved",
  );
  const featured =
    approved.find((image) => image.image_type === "scene") || approved[0];
  const image =
    artworkSource(featured?.image_url) || "/art/literary-landscape.webp";
  const worksheet =
    featured &&
    data.worksheets.find((item) => item.id === featured.worksheet_id);
  const title = featured
    ? featured.image_type === "scene"
      ? worksheet?.scene?.name
      : worksheet?.character_name
    : "이야기가 시작되는 풍경";
  return `<section class="exhibition-feature" aria-label="현재 문학 작품 전시"><div class="exhibition-intro"><span class="exhibition-kicker">우리 반의 문학 전시 <span>01</span></span><div class="exhibition-title"><h2>${e(activity.title)}</h2><span>${e(activity.author)}의 이야기에서</span></div><p class="exhibition-description">${e(activity.objectives || activity.introduction)}</p><div class="exhibition-actions"><a class="btn primary" href="${base}/showcase">우리 반 전시 입장 ${icon("arrow-up-right")}</a><button class="btn secondary" id="dashboard-qr">${icon("qr-code")} 학생 참여 QR</button></div><div class="exhibition-status"><span class="status-dot"></span>${e(STAGES[activity.stage])}<span class="exhibition-class">${e(activity.class_name || "나의 문학 수업")}</span><a href="${base}/live">실시간 취합 ${icon("arrow-up-right")}</a></div></div><figure class="exhibition-work"><a href="${base}/gallery" class="exhibition-mat" aria-label="${e(activity.title)} 작품 갤러리 열기"><img src="${e(image)}" alt="${e(featured?.one_line_description || "봄날의 농촌을 표현한 문학 전시 안내 그림")}" fetchpriority="high"/></a><figcaption><span><strong>${e(title || "작품 속 한 장면")}</strong><small>${e(worksheet?.student_label || "LITVERSE")} · ${isDemo ? "예시 작품" : featured ? "학생의 문학 해석" : "전시 안내 그림"}</small></span><span class="work-index">01 / ${String(approved.length || 1).padStart(2, "0")}</span></figcaption></figure></section>`;
}
