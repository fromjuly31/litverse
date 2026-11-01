import { artworkSource } from "../utils/artwork.js";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import {
  logo,
  icon,
  button,
  customSelect,
  initSelects,
  refreshIcons,
  toast,
} from "../components/ui.js";
import { showArt } from "../components/art.js";
import { teacherSession, request, isDemo } from "../services/api.js";
import { tagStatistics } from "../utils/domain.js";
import { e } from "../utils/helpers.js";
import { navigate } from "../main.js";
gsap.registerPlugin(Flip);
export async function showcasePage(root, id) {
  const data = await request("teacher/get", { id });
  const images = data.images.filter((i) => i.approval_status === "approved");
  if (!images.length) {
    root.innerHTML = `<main id="main" class="auth-page"><div class="empty">${icon("images")}<h1>전시할 작품을 기다리고 있어요.</h1><p>갤러리에서 작품을 승인한 뒤 전시를 시작해 주세요.</p><a href="/teacher/activity/${e(id)}/gallery" class="btn primary">갤러리로 돌아가기</a></div></main>`;
    return;
  }
  const tags = tagStatistics(
    images,
    data.worksheets,
    data.activity.aliases,
  ).tags;
  root.innerHTML = `<main id="main" class="showcase labels"><header class="showcase-header"><div class="showcase-title">${logo()}<span>${e(data.activity.title)} · ${images.length}개의 시선</span></div><div class="flex">${button("전체화면", "maximize-2", "secondary small", 'id="fullscreen"')}<a href="/teacher/activity/${e(id)}/gallery" class="icon-btn" aria-label="전시 종료">${icon("x")}</a></div></header><section class="showcase-stage" aria-label="승인된 학생 작품 전시"><div class="showcase-intro" aria-live="polite"></div><div class="showcase-wall"></div></section><div class="showcase-controls">${button("일시정지", "pause", "secondary", 'id="showcase-play"')}${button("다시 시작", "rotate-ccw", "ghost", 'id="showcase-restart"')}<button class="icon-btn" id="previous-art" aria-label="이전 작품">${icon("arrow-left")}</button><span class="showcase-counter" id="art-counter">전체 ${images.length}점</span><button class="icon-btn" id="next-art" aria-label="다음 작품">${icon("arrow-right")}</button>${customSelect({ name: "showcase-tag", label: "전시 성격 태그", value: "", options: [{ value: "", label: "모든 시선" }, ...tags.map((t) => ({ value: t.tag, label: `#${t.tag}` }))] })}${button("학생 번호 숨기기", "eye-off", "ghost label-toggle", 'id="toggle-students"')}${button("태그 숨기기", "eye-off", "ghost label-toggle", 'id="toggle-tags"')}</div>${isDemo ? '<p class="showcase-offline">데모 일러스트레이션 · 승인된 예시 작품만 전시하고 있습니다.</p>' : ""}</main>`;
  const wall = root.querySelector(".showcase-wall");
  const intro = root.querySelector(".showcase-intro");
  let timeline;
  let selectedIndex = -1;
  let activeTag = "";
  let showStudents = true;
  let showTags = true;
  let stopped = false;
  const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
  const label = (image) => {
    const w = data.worksheets.find((w) => w.id === image.worksheet_id);
    const title =
      image.image_type === "scene" ? w?.scene?.name : w?.character_name;
    return `${e(title || "")}${showStudents ? " · " + e(w?.student_label || "") : ""}${showTags ? "<br/>" + image.hashtags.map((t) => "#" + e(t)).join(" ") : ""}`;
  };
  const arrange = () => {
    const r = wall.getBoundingClientRect();
    const cols = Math.max(
      1,
      Math.min(
        innerWidth < 520 ? 4 : 10,
        Math.ceil(
          Math.sqrt(images.length * (r.width / Math.max(1, r.height)) * 0.78),
        ),
      ),
    );
    wall.style.setProperty("--columns", cols);
    wall.style.setProperty("--rows", Math.ceil(images.length / cols));
  };
  wall.innerHTML = images
    .map(
      (i) =>
        `<button type="button" class="showcase-piece" data-flip-id="${e(i.id)}" data-showcase-art="${e(i.id)}" aria-label="작품 확대: ${e(i.one_line_description)}"><img src="${e(artworkSource(i.image_url))}" alt="${e(i.one_line_description)}"/><small>${label(i)}</small></button>`,
    )
    .join("");
  initSelects(root);
  refreshIcons();
  arrange();
  const setPlayingLabel = () => {
    const btn = root.querySelector("#showcase-play");
    btn.innerHTML = `${icon(timeline?.paused() ? "play" : "pause")}<span>${timeline?.paused() ? "이어 보기" : "일시정지"}</span>`;
    refreshIcons();
  };
  const start = () => {
    timeline?.kill();
    intro.textContent = "";
    gsap.set(wall.children, { clearProps: "all" });
    timeline = gsap.timeline({
      onComplete: () => {
        timeline.pause();
        setPlayingLabel();
      },
    });
    if (reduced) {
      gsap.set(wall.children, { opacity: 1 });
      timeline.pause();
      setPlayingLabel();
      return;
    }
    gsap.set(wall.children, { opacity: 0, scale: 0.86, z: -100 });
    ["하나의 이야기", "서로 다른 시선", "LITVERSE"].forEach((text) => {
      timeline
        .call(() => {
          intro.textContent = text;
        })
        .fromTo(
          intro,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.7 },
        )
        .to(intro, { opacity: 0, duration: 0.5 }, "+=.55");
    });
    timeline.to(wall.children, {
      opacity: 1,
      scale: 1,
      z: 0,
      duration: 1,
      stagger: { amount: Math.min(5, images.length * 0.17), from: "center" },
      ease: "power2.out",
    });
    setPlayingLabel();
  };
  // Preload all images and tolerate individually unavailable files.
  await Promise.allSettled(
    [...wall.querySelectorAll("img")].map((img) =>
      Promise.race([
        img.decode().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 7000)),
      ]),
    ),
  );
  if (!root.isConnected) return;
  start();
  const revealAll = () => {
    timeline?.progress(1).pause();
    intro.textContent = "";
    gsap.set(wall.children, { opacity: 1, scale: 1, z: 0 });
    setPlayingLabel();
  };
  root.querySelector("#showcase-play").onclick = () => {
    if (timeline.progress() === 1) {
      start();
      return;
    }
    timeline.paused(!timeline.paused());
    setPlayingLabel();
  };
  root.querySelector("#showcase-restart").onclick = () => {
    selectedIndex = -1;
    start();
  };
  const focusArt = (dir) => {
    revealAll();
    const filtered = images.filter(
      (i) =>
        !activeTag ||
        i.hashtags.some((t) => (data.activity.aliases?.[t] || t) === activeTag),
    );
    if (!filtered.length) return;
    selectedIndex = (selectedIndex + dir + filtered.length) % filtered.length;
    root.querySelector("#art-counter").textContent =
      `${selectedIndex + 1} / ${filtered.length}`;
    showArt(filtered[selectedIndex], data, { manage: false });
  };
  root.querySelector("#previous-art").onclick = () => focusArt(-1);
  root.querySelector("#next-art").onclick = () => focusArt(1);
  wall.onclick = (ev) => {
    const key = ev.target.closest("[data-showcase-art]")?.dataset.showcaseArt;
    if (key) {
      timeline.pause();
      setPlayingLabel();
      showArt(
        images.find((i) => i.id === key),
        data,
        { manage: false },
      );
    }
  };
  root.querySelector("[name=showcase-tag]").onchange = (ev) => {
    activeTag = ev.target.value;
    revealAll();
    const state = Flip.getState(wall.children);
    const matches = images
      .filter((i) =>
        i.hashtags.some((t) => (data.activity.aliases?.[t] || t) === activeTag),
      )
      .map((i) => i.id);
    const elements = [...wall.children];
    const matching = elements.filter((el) =>
      matches.includes(el.dataset.showcaseArt),
    );
    const others = elements.filter(
      (el) => !matches.includes(el.dataset.showcaseArt),
    );
    let ordered;
    if (!activeTag)
      ordered = images.map((i) =>
        elements.find((el) => el.dataset.showcaseArt === i.id),
      );
    else {
      const mid = Math.floor(others.length / 2);
      ordered = [...others.slice(0, mid), ...matching, ...others.slice(mid)];
    }
    ordered.forEach((el) => {
      wall.append(el);
      el.classList.toggle(
        "faded",
        !!activeTag && !matches.includes(el.dataset.showcaseArt),
      );
      el.classList.toggle(
        "emphasized",
        !!activeTag && matches.includes(el.dataset.showcaseArt),
      );
    });
    if (!reduced) Flip.from(state, { duration: 0.8, ease: "power2.inOut" });
  };
  const redrawLabels = () =>
    wall
      .querySelectorAll(".showcase-piece")
      .forEach(
        (el) =>
          (el.querySelector("small").innerHTML = label(
            images.find((i) => i.id === el.dataset.showcaseArt),
          )),
      );
  root.querySelector("#toggle-students").onclick = (ev) => {
    showStudents = !showStudents;
    ev.currentTarget.innerHTML = `${icon(showStudents ? "eye-off" : "eye")}<span>학생 번호 ${showStudents ? "숨기기" : "보기"}</span>`;
    redrawLabels();
    refreshIcons();
  };
  root.querySelector("#toggle-tags").onclick = (ev) => {
    showTags = !showTags;
    ev.currentTarget.innerHTML = `${icon(showTags ? "eye-off" : "eye")}<span>태그 ${showTags ? "숨기기" : "보기"}</span>`;
    redrawLabels();
    refreshIcons();
  };
  root.querySelector("#fullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast(
        "이 브라우저에서는 전체화면을 사용할 수 없어요. 현재 화면에서 전시를 이어갑니다.",
      );
    }
  };
  const observer = new ResizeObserver(arrange);
  observer.observe(wall);
  const keydown = (ev) => {
    if (
      ev.target.closest("input,button,[role=combobox]") ||
      document.querySelector(".modal-overlay")
    )
      return;
    if (ev.key === "ArrowRight") focusArt(1);
    if (ev.key === "ArrowLeft") focusArt(-1);
    if (ev.key === " ") {
      ev.preventDefault();
      root.querySelector("#showcase-play").click();
    }
  };
  document.addEventListener("keydown", keydown);
  return () => {
    stopped = true;
    timeline?.kill();
    observer.disconnect();
    document.removeEventListener("keydown", keydown);
    gsap.killTweensOf(wall.children);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
}
