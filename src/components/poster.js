import { e, downloadText } from "../utils/helpers.js";
import { artworkSource } from "../utils/artwork.js";
import posterStyles from "../styles/poster.css?inline";

export function fitPosterForPrint() {
  document
    .querySelectorAll(".literary-poster:not(.poster-mini)")
    .forEach((poster) => {
      poster.style.zoom = "1";
      const height = poster.getBoundingClientRect().height;
      poster.style.zoom = String(Math.min(1, (390 * 96) / 25.4 / height));
    });
}
export function resetPosterPrint() {
  document
    .querySelectorAll(".literary-poster")
    .forEach((p) => (p.style.zoom = ""));
}

export function posterMarkup(result, images = [], compact = false) {
  const image = (id) =>
    artworkSource(images.find((i) => i.id === id)?.image_url || "");
  return `<article class="literary-poster ${compact ? "poster-mini" : ""}" aria-label="${e(result.title)} 문학 포스터">
    <header class="poster-heading"><div class="poster-edition"><span>LITVERSE COLLECTION</span><span>문학, 우리의 해석으로 남다</span></div><p class="poster-original">${e(result.author)}의 작품</p><h2>${e(result.title)}</h2><div class="poster-rule"><span>BACKGROUND · CHARACTER · SCENE</span></div></header>
    <section class="poster-story"><span class="poster-index">01 / THE STORY</span><h3>이야기의 시작</h3><p>${e(result.synopsis)}</p></section>
    <section class="poster-context"><span class="poster-index">02 / THE WORLD</span><h3>이야기가 머무는 곳</h3><div><p><b>시간적 배경</b>${e(result.temporal_background)}</p><p><b>공간적 배경</b>${e(result.spatial_background)}</p></div></section>
    <div class="poster-pair"><section class="poster-interpretation"><figure><img src="${e(image(result.character.image_id))}" alt="${e(result.character.name)}의 성격을 표현한 최종 인물 작품"/></figure><span class="poster-index">03 / THE CHARACTER</span><h3>${e(result.character.name)}</h3><p>${e(result.character.description)}</p><div class="poster-evidence"><b>문장 속 근거</b><p>${e(result.character.evidence)}</p></div></section><section class="poster-interpretation"><figure><img src="${e(image(result.scene.image_id))}" alt="${e(result.scene.name)}을 표현한 최종 사건 작품"/></figure><span class="poster-index">04 / THE MOMENT</span><h3>${e(result.scene.name)}</h3><p>${e(result.scene.description)}</p><div class="poster-evidence"><b>이야기 속 장면</b><p>${e(result.scene.evidence)}</p></div></section></div>
    <footer class="poster-signature"><div><span>READ. INTERPRET. REMEMBER.</span><small>한 편의 작품, 우리만의 시선.</small></div><div><small>이 전시작을 만든 사람</small><strong>${e(result.signature)}</strong></div></footer>
  </article>`;
}

export async function downloadPoster(result, images) {
  const embedded = await Promise.all(
    images.map(async (image) => {
      const response = await fetch(artworkSource(image.image_url));
      if (!response.ok)
        throw new Error("포스터 사진을 내려받지 못했어요. 다시 시도해 주세요.");
      const blob = await response.blob();
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return { ...image, image_url: url };
    }),
  );
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(result.title)} — 문학 전시작</title><style>body{margin:0;padding:24px;background:#d9d4c9}*{box-sizing:border-box}${posterStyles}</style><body>${posterMarkup(result, embedded)}<script>addEventListener('beforeprint',${fitPosterForPrint.toString()});addEventListener('afterprint',${resetPosterPrint.toString()});</script></body></html>`;
  downloadText(
    html,
    `LITVERSE-${result.title.replace(/[<>:"/\\|?*]/g, "")}-포스터.html`,
    "text/html;charset=utf-8",
  );
}
