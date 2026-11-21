import { e } from "../utils/helpers.js";

export function docentMarkup(docent) {
  if (!docent?.script) return "";
  return `<div class="docent-player"><strong>${docent.audio_url ? "오디오 도슨트 · AI 음성" : "오디오 도슨트 대본"}</strong>${docent.audio_url ? `<audio controls preload="none" aria-label="장면 해설 듣기" src="${e(docent.audio_url)}"></audio><details><summary>대본 보기</summary><p>${e(docent.script)}</p></details>` : `<p>${e(docent.script)}</p>`}</div>`;
}
