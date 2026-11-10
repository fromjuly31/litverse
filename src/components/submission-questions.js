import { e } from "../utils/helpers.js";

export function questionResponseList(responses = []) {
  if (!responses.length) return "";
  return `<section class="submission-responses"><h4>사진과 함께 남긴 답변</h4><dl>${responses.map((response, index) => `<div><dt><span>Q${index + 1}.</span> ${e(response.question)}</dt><dd>${e(response.answer)}</dd></div>`).join("")}</dl></section>`;
}
