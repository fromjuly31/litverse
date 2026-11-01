import { logo, icon } from "./ui.js";
export const museumHeader = () =>
  `<header class="archive-header">${logo()}<a class="archive-wordmark" href="/">문학 전시관 <span>A LITERARY MUSEUM</span></a><nav aria-label="전시관 메뉴"><a href="/teacher">수업하기</a><a href="/exhibition">관람하기</a><a href="/admin" class="archive-admin" aria-label="관리자 로그인">${icon("lock-keyhole")}<span>관리자</span></a></nav></header>`;
export const museumFooter = () =>
  `<footer class="archive-footer"><span>LITVERSE · 한 편의 문학, 오래 남을 시선</span><span>READ. INTERPRET. COLLECT.</span></footer>`;
