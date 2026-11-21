import { museumHeader, museumFooter } from "../components/museum-shell.js";
import { icon, refreshIcons, toast } from "../components/ui.js";
import { request } from "../services/api.js";
import { e } from "../utils/helpers.js";
import { assetUrl } from "../utils/paths.js";
import {
  posterMarkup,
  downloadPoster,
  fitPosterForPrint,
  resetPosterPrint,
} from "../components/poster.js";
import { forgetLessons } from "../services/access.js";
import {
  bindPublicPerspectives,
  perspectiveCover,
  perspectivesSection,
} from "./deepening-exhibit.js";

export async function museumHome(root) {
  forgetLessons();
  const { total: exhibitionCount } = await request("public/collection", {
    count_only: true,
  });
  root.classList.add("museum-entry");
  root.innerHTML = `${museumHeader()}<main id="main" class="museum-home"><div class="museum-welcome"><span class="eyebrow">THE LITERARY MUSEUM</span><h1>읽었던 문장이,<br/> 우리의 작품으로 남는 곳.</h1><p>읽고, 해석하고, 한 장의 작품으로 간직하세요.</p></div><section class="museum-choices" aria-label="문학 전시관 입장"><a class="museum-choice choice-class" href="/teacher"><img src="${e(assetUrl("/art/literary-landscape.webp"))}" alt="봄꽃이 핀 길에서 만난 두 인물의 문학 일러스트" width="1536" height="1024" fetchpriority="high" decoding="async"/><div class="choice-shade"></div><span class="choice-index">01 — THE CLASSROOM</span><div class="choice-copy"><span>새로운 해석을 시작하는 곳</span><h2>수업하기</h2><p>작품을 고르고, 우리만의 시선으로 함께 읽어요.</p><span class="choice-enter"><span>수업 만들기 · 이어가기</span>${icon("arrow-up-right")}</span></div></a><a class="museum-choice choice-visit" href="/exhibition"><img src="${e(assetUrl("/art/literary-museum-interior.webp"))}" alt="문학 속 인물과 풍경이 액자에 걸린 수채화 전시실" width="1536" height="1024" decoding="async"/><div class="choice-shade"></div><span class="choice-index">02 — THE COLLECTION</span><div class="choice-copy"><span>완성된 이야기를 만나는 곳</span><h2>관람하기</h2><p>함께 완성한 문학 작품과 새로운 해석을 만나요.</p><span class="choice-enter"><span>문학 전시관 입장</span>${icon("arrow-up-right")}</span></div></a></section><section class="museum-inventory" aria-label="전시 작품 현황"><div class="inventory-heading"><span class="eyebrow">THE COLLECTION</span><h2>전시 현황</h2></div><p class="inventory-summary"><span>전시 중인 작품</span><strong>${exhibitionCount.toLocaleString("ko-KR")}<small>점</small></strong></p><a class="inventory-all" href="/exhibition" aria-label="전체 전시작 ${exhibitionCount}점 보기"><span>전체 보기</span>${icon("arrow-right")}</a></section></main>${museumFooter()}`;
}

function workCard(work) {
  const poster = work.poster;
  const url = `/exhibition/work-${encodeURIComponent(work.key)}`;
  return `<article class="exhibit-card"><a class="exhibit-frame ${poster ? "" : "deep-exhibit-frame"}" href="${e(url)}" aria-label="${e(work.title)} 전시작 자세히 보기">${poster ? `<div class="exhibit-mat">${posterMarkup(poster.result, poster.images, true)}</div>` : perspectiveCover(work)}</a><div class="exhibit-label"><div><h2>${e(work.title)}</h2><p>${e(work.author)} 원작</p></div>${poster?.signature ? `<span class="exhibit-signature">${e(poster.signature)}</span>` : ""}</div></article>`;
}

async function workDetail(root, id) {
  const ref = id.startsWith("work-")
    ? { work_key: decodeURIComponent(id.slice(5)) }
    : id.startsWith("deep-")
      ? { session_id: id.slice(5) }
      : { poster_id: id };
  const work = await request("public/work", ref);
  const poster = work.poster;
  const posterLinks =
    work.posters.length > 1
      ? `<nav class="work-poster-list flex wrap" aria-label="이 작품의 포스터"><strong>저장된 포스터</strong>${work.posters
          .map(
            (item, index) =>
              `<a class="btn secondary small" href="/exhibition/${e(item.id)}" ${poster?.id === item.id ? 'aria-current="page"' : ""}>${e(item.signature || `포스터 ${index + 1}`)}</a>`,
          )
          .join("")}</nav>`
      : "";
  const posterTools = poster
    ? `<div>${poster.can_reopen ? `<a class="btn secondary" href="/teacher/activity/${e(poster.id)}/background">${icon("lock-keyhole")} 수업 다시 열기</a>` : ""}<button class="btn secondary" id="download-poster">${icon("download")} 포스터 HTML 저장</button><button class="btn primary" id="print-poster">${icon("file-text")} 인쇄 · PDF 저장</button></div>`
    : "";
  const heading = poster
    ? `<h1 class="sr-only">${e(work.title)} 완성 전시작</h1>`
    : `<header class="collection-title"><h1>${e(work.title)}</h1><p>${e(work.author)} 원작</p></header>`;
  root.innerHTML = `${museumHeader()}<main id="main" class="exhibit-detail"><div class="exhibit-toolbar"><a class="text-link" href="/exhibition">${icon("arrow-left")} 전시관으로</a>${posterTools}</div>${heading}${posterLinks}${poster ? `<div class="poster-print-area">${posterMarkup(poster.result, poster.images)}</div>` : ""}${perspectivesSection(work.perspectives)}</main>${museumFooter()}`;
  bindPublicPerspectives(root, work.perspectives);
  if (!poster) return;

  root.querySelector("#print-poster").onclick = () => window.print();
  root.querySelector("#download-poster").onclick = async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    try {
      await downloadPoster(poster.result, poster.images);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      btn.disabled = false;
    }
  };
  window.addEventListener("beforeprint", fitPosterForPrint);
  window.addEventListener("afterprint", resetPosterPrint);
  return () => {
    window.removeEventListener("beforeprint", fitPosterForPrint);
    window.removeEventListener("afterprint", resetPosterPrint);
  };
}

export async function exhibitionPage(root, id) {
  if (id) return workDetail(root, id);
  root.classList.add("museum-collection");
  let page = await request("public/collection"),
    exhibits = page.items,
    activeQuery = "",
    sequence = 0,
    timer,
    stopped = false;
  root.innerHTML = `${museumHeader()}<main id="main" class="collection-page"><header class="collection-title"><span class="eyebrow">THE PERMANENT COLLECTION</span><h1>문학 전시관</h1><p>함께 읽고 해석한 내용을 작품별로 만나보세요.</p><span class="collection-total">총 ${page.total}점 소장</span></header><label class="search-field collection-search">${icon("search")}<input type="search" id="exhibit-search" aria-label="전시 작품 검색" maxlength="120" placeholder="작품명, 원작 작가, 전시작 제작자로 검색"/></label><div class="collection-grid" id="collection-grid"></div><div class="collection-more"><button class="btn secondary" id="more-exhibits">전시작 더 보기</button></div></main>${museumFooter()}`;
  const draw = () => {
    const q = root
      .querySelector("#exhibit-search")
      .value.trim()
      .toLocaleLowerCase();
    root.classList.toggle("collection-is-empty", exhibits.length === 0);
    root.querySelector(".collection-more").hidden =
      exhibits.length >= page.total;
    root.querySelector(".collection-search").hidden = !page.total && !q;
    root.querySelector(".collection-total").textContent =
      `${q ? "검색 결과" : "총"} ${page.total}점`;
    root.querySelector("#collection-grid").innerHTML = exhibits.length
      ? exhibits.map(workCard).join("")
      : `<section class="empty collection-empty"><div class="collection-empty-art">${q ? icon("search") : `<img class="empty-gallery-art" src="${e(assetUrl("/art/literary-museum-interior.webp"))}" alt="첫 작품을 기다리는 따뜻한 문학 전시실" width="340" height="170"/>`}</div><div class="collection-empty-copy"><h2>${q ? "검색한 전시작이 없어요." : "아직 걸리지 않은, 우리의 첫 작품."}</h2><p>${q ? "다른 작품명이나 제작자 이름으로 찾아보세요." : "수업을 마무리하고 전시작을 저장하면 이곳에 전시됩니다."}</p>${q ? "" : '<a class="btn primary" href="/teacher">첫 수업 시작하기</a>'}</div></section>`;
    refreshIcons();
  };
  const load = async (more = false) => {
    const version = ++sequence,
      btn = root.querySelector("#more-exhibits"),
      query = root.querySelector("#exhibit-search").value.trim();
    more = more && query === activeQuery;
    btn.disabled = true;
    try {
      const next = await request("public/collection", {
        query,
        offset: more ? exhibits.length : 0,
      });
      if (stopped || version !== sequence) return;
      page = next;
      activeQuery = query;
      exhibits = more ? [...exhibits, ...next.items] : next.items;
      draw();
    } catch (error) {
      if (!stopped) toast(error.message, "error");
    } finally {
      btn.disabled = false;
    }
  };
  root.querySelector("#exhibit-search").oninput = () => {
    ++sequence;
    clearTimeout(timer);
    timer = setTimeout(() => load(), 300);
  };
  root.querySelector("#more-exhibits").onclick = () => load(true);
  draw();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
