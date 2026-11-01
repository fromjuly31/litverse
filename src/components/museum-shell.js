import { logo, icon } from "./ui.js";
import { currentRoute } from "../utils/paths.js";

export function museumHeader() {
  const path = currentRoute().split("?")[0];
  const current = (section) =>
    path === section || path.startsWith(`${section}/`)
      ? ' aria-current="page"'
      : "";
  return `<header class="archive-header">${logo()}<span class="archive-wordmark">문학 전시관 <span>A LITERARY MUSEUM</span></span><nav aria-label="전시관 메뉴"><a href="/teacher"${current("/teacher")}>수업하기</a><a href="/exhibition"${current("/exhibition")}>관람하기</a><a href="/admin" class="archive-admin" aria-label="관리자 로그인"${current("/admin")}>${icon("lock-keyhole")}<span>관리자</span></a></nav></header>`;
}
export const museumFooter = () =>
  `<footer class="archive-footer"><span>LITVERSE · 한 편의 문학, 오래 남을 시선</span><span>READ. INTERPRET. COLLECT.</span></footer>`;
