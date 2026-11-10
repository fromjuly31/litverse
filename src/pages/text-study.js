import { teacherShell, pageHeading } from "./teacher.js";
import {
  button,
  icon,
  customSelect,
  initSelects,
  refreshIcons,
  confirmDialog,
} from "../components/ui.js";
import { e, safeStorage } from "../utils/helpers.js";
import { textStudyValue } from "../utils/text-study.js";
import { createNarrator } from "../services/narrator.js";
import { request } from "../services/api.js";
import { navigate } from "../main.js";

export function textStudyPage(root, data) {
  const activity = data.activity,
    study = textStudyValue(activity),
    base = `/teacher/activity/${activity.id}`;
  const paragraphs = study.enabled ? study.paragraphs : [];
  if (!paragraphs.length) {
    teacherShell(
      root,
      "text-study",
      activity,
      `${pageHeading("READ TOGETHER", "본문 학습", "선택한 본문을 문단별로 함께 읽어요.")}<section class="panel reading-empty"><h2>아직 본문이 준비되지 않았어요.</h2><p>수업 정보 수정에서 ‘본문 학습 사용하기’를 선택하고 PDF의 본문을 추가해 주세요.</p><a class="btn primary" href="${base}/edit">${icon("file-text")} 본문 추가하기</a></section>`,
    );
    return;
  }
  const saved = safeStorage(`litverse-reading:${activity.id}`) || {};
  let index = Math.max(
    0,
    paragraphs.findIndex((paragraph) => paragraph.id === saved.id),
  );
  let fontSize =
      safeStorage("litverse-reading-font") || (innerWidth <= 600 ? 30 : 42),
    voices = [],
    stopped = false;
  const preferences = safeStorage("litverse-narration") || {
    voice: "default",
    rate: "1",
    pitch: "1",
  };
  teacherShell(
    root,
    "text-study",
    activity,
    `${pageHeading("READ TOGETHER", "본문 학습", study.source_name || "우리의 속도로, 한 문단씩 함께 읽어요.", `<button type="button" class="btn secondary" id="reading-next-activity">등장인물 갤러리 ${icon("arrow-right")}</button>`, true)}
    <section class="reading-panel" id="reading-panel"><div class="reading-toolbar"><div><span class="eyebrow">CLOSE READING</span><span id="reading-position" role="status" aria-live="polite"></span></div><div class="reading-display-controls"><label for="reading-font">글자 크기</label><input id="reading-font" type="range" min="24" max="64" step="2" value="${fontSize}"/><output id="reading-font-value">${fontSize}px</output>${button("전체 화면", "maximize-2", "secondary", 'id="reading-fullscreen"')}</div></div>
    <div class="reading-stage"><button type="button" class="reading-page-arrow" id="reading-prev" aria-label="이전 본문 문단">${icon("arrow-left")}</button><article class="reading-paragraph" tabindex="0" aria-label="현재 본문 문단"><span class="reading-paragraph-number" id="reading-paragraph-number"></span><div class="reading-text" id="reading-text"></div><span class="reading-source" id="reading-source"></span></article><button type="button" class="reading-page-arrow" id="reading-next" aria-label="다음 본문 문단">${icon("arrow-right")}</button></div>
    <div class="reading-progress"><progress id="reading-progress" max="${paragraphs.length}" value="1" aria-label="본문 학습 진행률"></progress><div id="reading-dots" class="reading-dots"></div></div>
    <section class="narration-controls" aria-label="본문 낭독 설정"><div class="narration-playback">${button("낭독 시작", "play", "primary", 'id="narration-play"')}${button("낭독 정지", "x", "secondary", 'id="narration-stop" disabled')}<span id="narration-status" role="status" aria-live="polite">읽을 준비가 되었어요.</span></div><div class="narration-settings"><label class="field"><span>낭독 목소리</span><div id="narration-voices"></div><small>사용 가능한 목소리는 기기와 브라우저마다 달라요.</small></label><div class="field"><span>낭독 속도</span>${customSelect(
      {
        name: "narration_rate",
        label: "낭독 속도",
        value: preferences.rate,
        options: [
          { value: "0.7", label: "천천히 · 0.7배" },
          { value: "0.85", label: "조금 천천히 · 0.85배" },
          { value: "1", label: "보통 · 1배" },
          { value: "1.2", label: "조금 빠르게 · 1.2배" },
          { value: "1.5", label: "빠르게 · 1.5배" },
        ],
      },
    )}</div><div class="field"><span>목소리 높낮이</span>${customSelect({
      name: "narration_pitch",
      label: "목소리 높낮이",
      value: preferences.pitch,
      options: [
        { value: "0.8", label: "낮게" },
        { value: "1", label: "기본" },
        { value: "1.2", label: "높게" },
      ],
    })}</div><label class="check-field narration-continuous"><input id="narration-continuous" type="checkbox"/><span>다음 문단도 이어서 낭독</span></label></div></section><p class="reading-shortcuts">← → 문단 이동 · 본문에 초점을 두고 Space로 낭독·일시정지</p></section>`,
  );
  const panel = root.querySelector("#reading-panel"),
    text = root.querySelector("#reading-text"),
    status = root.querySelector("#narration-status");
  let narrator;
  const clearMark = () => {
    text.textContent = paragraphs[index].text;
  };
  const highlight = (offset, length) => {
    const value = paragraphs[index].text;
    text.replaceChildren(document.createTextNode(value.slice(0, offset)));
    const mark = document.createElement("mark");
    mark.textContent = value.slice(offset, offset + length);
    text.append(mark, document.createTextNode(value.slice(offset + length)));
    const article = root.querySelector(".reading-paragraph");
    const bounds = article.getBoundingClientRect(),
      current = mark.getBoundingClientRect();
    if (current.bottom > bounds.bottom - 30)
      article.scrollTop += current.bottom - bounds.bottom + 40;
    else if (current.top < bounds.top + 30)
      article.scrollTop -= bounds.top - current.top + 40;
  };
  const updatePlayback = (state) => {
    const play = root.querySelector("#narration-play");
    if (!play) return;
    play.innerHTML = `${icon(state === "speaking" ? "pause" : "play")} ${state === "speaking" ? "일시정지" : state === "paused" ? "이어서 낭독" : "낭독 시작"}`;
    root.querySelector("#narration-stop").disabled = state === "idle";
    status.textContent =
      state === "speaking"
        ? "현재 문단을 낭독하고 있어요."
        : state === "paused"
          ? "낭독을 잠시 멈췄어요."
          : "읽을 준비가 되었어요.";
    if (state === "idle") clearMark();
    refreshIcons();
  };
  const persistPreferences = () => {
    preferences.voice =
      root.querySelector("[name=narration_voice]")?.value || "default";
    preferences.rate = root.querySelector("[name=narration_rate]").value;
    preferences.pitch = root.querySelector("[name=narration_pitch]").value;
    safeStorage("litverse-narration", preferences);
  };
  const play = () => {
    persistPreferences();
    narrator.start(paragraphs[index].text, {
      voice: voices.find((voice) => voice.voiceURI === preferences.voice),
      rate: Number(preferences.rate),
      pitch: Number(preferences.pitch),
    });
  };
  const draw = () => {
    clearMark();
    root.querySelector(".reading-paragraph").scrollTop = 0;
    panel.style.setProperty("--reading-font-size", `${fontSize}px`);
    root.querySelector("#reading-position").textContent =
      `${index + 1} / ${paragraphs.length} 문단`;
    root.querySelector("#reading-paragraph-number").textContent =
      `PARAGRAPH ${String(index + 1).padStart(2, "0")}`;
    root.querySelector("#reading-source").textContent = paragraphs[index].page
      ? `${paragraphs[index].source_name || study.source_name || "첨부 PDF"} · ${paragraphs[index].page}쪽`
      : "직접 정리한 본문";
    root.querySelector("#reading-prev").disabled = index === 0;
    root.querySelector("#reading-next").disabled =
      index === paragraphs.length - 1;
    root.querySelector("#reading-progress").value = index + 1;
    root.querySelector("#reading-dots").innerHTML = paragraphs
      .map(
        (paragraph, position) =>
          `<button type="button" data-reading-index="${position}" ${position === index ? 'aria-current="step"' : ""} aria-label="본문 ${position + 1}문단으로 이동">${position + 1}</button>`,
      )
      .join("");
    safeStorage(`litverse-reading:${activity.id}`, {
      id: paragraphs[index].id,
    });
  };
  const turn = (next) => {
    if (next < 0 || next >= paragraphs.length) return;
    narrator.stop();
    index = next;
    draw();
  };
  narrator = createNarrator({
    onState: updatePlayback,
    onBoundary: highlight,
    onError: (message) => {
      status.textContent = message;
    },
    onFinished: () => {
      if (
        !stopped &&
        root.querySelector("#narration-continuous").checked &&
        index < paragraphs.length - 1
      ) {
        index++;
        draw();
        play();
      }
    },
  });
  const voiceList = () => {
    if (stopped) return;
    voices = [...(globalThis.speechSynthesis?.getVoices() || [])].sort(
      (a, b) =>
        Number(b.lang.startsWith("ko")) - Number(a.lang.startsWith("ko")) ||
        a.name.localeCompare(b.name),
    );
    const current =
      root.querySelector("[name=narration_voice]")?.value || preferences.voice;
    const selected = voices.some((voice) => voice.voiceURI === current)
      ? current
      : current === "default" &&
          voices.some((voice) => voice.lang.startsWith("ko"))
        ? voices.find((voice) => voice.lang.startsWith("ko")).voiceURI
        : "default";
    root.querySelector("#narration-voices").innerHTML = customSelect({
      name: "narration_voice",
      label: "낭독 목소리",
      value: selected,
      options: [
        { value: "default", label: "기기 기본 목소리" },
        ...voices.map((voice) => ({
          value: voice.voiceURI,
          label: `${voice.name} · ${voice.lang}`,
        })),
      ],
    });
    initSelects(root);
    refreshIcons();
  };
  voiceList();
  globalThis.speechSynthesis?.addEventListener("voiceschanged", voiceList);
  const togglePlay = () => {
    if (narrator.status === "speaking") narrator.pause();
    else if (narrator.status === "paused") narrator.resume();
    else play();
  };
  root.querySelector("#narration-play").onclick = togglePlay;
  root.querySelector("#narration-stop").onclick = () => narrator.stop();
  root.querySelector("#reading-prev").onclick = () => turn(index - 1);
  root.querySelector("#reading-next").onclick = () => turn(index + 1);
  root.querySelector("#reading-dots").onclick = (event) => {
    const target = event.target.closest("[data-reading-index]");
    if (target) turn(Number(target.dataset.readingIndex));
  };
  root.querySelector("#reading-font").oninput = (event) => {
    fontSize = Number(event.target.value);
    panel.style.setProperty("--reading-font-size", `${fontSize}px`);
    root.querySelector("#reading-font-value").textContent = `${fontSize}px`;
    safeStorage("litverse-reading-font", fontSize);
  };
  root
    .querySelector(".narration-settings")
    .addEventListener("change", (event) => {
      if (event.target.name?.startsWith("narration_")) {
        narrator.stop();
        persistPreferences();
      }
    });
  root.querySelector("#reading-fullscreen").onclick = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.classList.contains("reading-present"))
      panel.classList.remove("reading-present");
    else {
      try {
        await panel.requestFullscreen();
      } catch {
        panel.classList.add("reading-present");
      }
    }
    fullscreenLabel();
  };
  const fullscreenLabel = () => {
    const active =
      !!document.fullscreenElement ||
      panel.classList.contains("reading-present");
    root.querySelector("#reading-fullscreen").innerHTML =
      `${icon(active ? "minimize-2" : "maximize-2")} ${active ? "전체 화면 닫기" : "전체 화면"}`;
    refreshIcons();
  };
  document.addEventListener("fullscreenchange", fullscreenLabel);
  const keys = (event) => {
    if (event.target.closest("input,textarea,.custom-select,[contenteditable]"))
      return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      turn(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      turn(index + 1);
    } else if (event.key === " " && !event.target.closest("button,a")) {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "Escape") {
      panel.classList.remove("reading-present");
      fullscreenLabel();
    }
  };
  document.addEventListener("keydown", keys);
  root.querySelector("#reading-next-activity").onclick = () => {
    narrator.stop();
    if (["ANALYSIS", "SUBMISSION", "CLOSED"].includes(activity.stage))
      return navigate(`${base}/gallery`);
    confirmDialog({
      title: "인물·사건 분석을 시작할까요?",
      message: "본문을 읽으며 나눈 생각을 바탕으로 인물과 사건을 분석합니다.",
      confirm: "분석 시작",
      onConfirm: async () => {
        await request("teacher/stage", { id: activity.id, stage: "ANALYSIS" });
        await navigate(`${base}/gallery`);
      },
    });
  };
  if (!narrator.supported) {
    root.querySelector("#narration-play").disabled = true;
    status.textContent =
      "이 브라우저에서는 낭독을 지원하지 않아요. 본문 읽기와 문단 이동은 이용할 수 있어요.";
  }
  draw();
  initSelects(root);
  refreshIcons();
  return () => {
    stopped = true;
    narrator.stop();
    globalThis.speechSynthesis?.removeEventListener("voiceschanged", voiceList);
    document.removeEventListener("keydown", keys);
    document.removeEventListener("fullscreenchange", fullscreenLabel);
    if (document.fullscreenElement === panel)
      document.exitFullscreen().catch(() => {});
  };
}
