import { writeFileSync } from "node:fs";
const palettes = [
  ["#263f40", "#8d9d7a", "#e1ce9d", "#c48661", "#151e26"],
  ["#202c45", "#526f8c", "#afc5ca", "#bf9279", "#121c2b"],
  ["#493b36", "#b09c78", "#e2c69b", "#c99979", "#272322"],
  ["#273544", "#6b7d7f", "#b9c6b6", "#ad8d76", "#14222c"],
];
for (let i = 0; i < 4; i++) {
  const [dark, mid, light, skin, ink] = palettes[i];
  const female = i % 2 === 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 760" role="img" aria-label="문학적 해석을 표현한 데모 일러스트레이션">
  <defs><linearGradient id="bg" x2=".8" y2="1"><stop stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient><linearGradient id="face"><stop stop-color="${skin}"/><stop offset=".58" stop-color="${light}"/><stop offset="1" stop-color="${skin}"/></linearGradient><linearGradient id="coat" x2="1" y2=".5"><stop stop-color="${ink}"/><stop offset=".6" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient><filter id="grain"><feTurbulence baseFrequency=".45" numOctaves="3" seed="${i + 3}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".15"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter></defs>
  <g filter="url(#grain)"><path fill="url(#bg)" d="M0 0h600v760H0z"/><circle cx="${female ? 412 : 150}" cy="180" r="135" fill="${light}" opacity=".45"/><path d="M0 410Q100 290 230 355T600 290V760H0" fill="${dark}" opacity=".6"/><path d="M0 530Q160 405 310 460T600 400V760H0" fill="${ink}" opacity=".35"/>
  <g opacity=".7" fill="none" stroke="${light}" stroke-width="2"><path d="M44 760Q115 510 54 340M532 760Q470 480 575 287"/><path d="m67 489-32-32m37 73 34-43m416 48-31-46m32 6 37-31m-15-59 34-33"/></g>
  <path d="M100 760c-5-159 58-251 150-269l2-84h107l8 83c103 30 157 116 151 270" fill="url(#coat)"/>
  <path d="m250 409 4 95 50 53 60-62-10-96" fill="${skin}"/><path d="m253 433 101-23-2 43-62 47" fill="${ink}" opacity=".2"/>
  <path d="M207 229q-19 62 7 155 20 75 83 94 66-7 98-88 19-47 7-134-20-75-99-76-67 2-96 49" fill="url(#face)"/>
  <path d="m207 288q-25-24-28 4 2 44 39 55m182-60q27-25 24 5-1 35-28 54" fill="${skin}"/>
  ${female ? `<path d="M196 314q-54-94-10-161 57-79 152-39 99 24 80 137l-19 66-14-82q-61-5-102-65-18 60-67 78z" fill="${ink}"/><path d="M203 303q-35 48-12 131l44 80-28-124m191-84q33 71-3 149l-33 56 19-126" fill="${ink}"/><path d="M400 375q55 78 7 186l-25 31 7-155" fill="${ink}"/>` : `<path d="m197 311-25-80q-12-89 83-112 70-37 128 29 54 28 26 140l-18 24-3-93-26-40-30 39-18-38-42 39-17-27-44 52-7 69" fill="${ink}"/><path d="m221 183 39-33m16 19 28-28m17 29 31-10" stroke="${mid}" stroke-width="5" fill="none"/>`}
  <path d="m231 310q25-16 48-2m48 0q26-15 47 2" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/><path d="m232 331q22-14 46 0m48 0q24-14 47-1" fill="none" stroke="${ink}" stroke-width="3"/><ellipse cx="257" cy="331" rx="5" ry="7" fill="${ink}"/><ellipse cx="347" cy="331" rx="5" ry="7" fill="${ink}"/>
  <path d="m304 328-12 49q13 7 25 0" fill="none" stroke="${skin}" stroke-width="5"/><path d="m270 407q30 ${female ? 12 : 3} 57-3" fill="none" stroke="${dark}" stroke-width="3"/><path d="m282 422 35-2" stroke="${light}" opacity=".7" stroke-width="3"/>
  <path d="m242 488 61 72-50 120-47-148m157-44-60 72 45 119 48-145" fill="${light}" opacity="${female ? ".8" : ".4"}"/><path d="m304 562-4 198" fill="none" stroke="${ink}" stroke-width="3"/>
  ${female ? `<g fill="${light}" opacity=".85"><circle cx="87" cy="429" r="10"/><circle cx="63" cy="417" r="8"/><circle cx="77" cy="405" r="9"/><circle cx="514" cy="466" r="9"/><circle cx="529" cy="451" r="7"/><circle cx="502" cy="451" r="8"/></g>` : ""}
  <path d="M0 728q120-35 210 32H0m600-19q-100-25-190 19h190" fill="${dark}" opacity=".75"/>
  </g></svg>`;
  writeFileSync(
    new URL(`../public/art/portrait-${i + 1}.svg`, import.meta.url),
    svg,
  );
}
