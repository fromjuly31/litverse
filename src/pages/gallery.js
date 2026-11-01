import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { teacherShell, pageHeading, showQR } from "./teacher.js";
import {
  button,
  icon,
  customSelect,
  initSelects,
  refreshIcons,
  confirmDialog,
  toast,
  openModal,
} from "../components/ui.js";
import { artCard, showArt, compareArt } from "../components/art.js";
import { filterImages, tagStatistics, normalizeTags } from "../utils/domain.js";
import { e, debounce } from "../utils/helpers.js";
import { request, subscribe, isDemo } from "../services/api.js";
gsap.registerPlugin(Flip);
export function galleryPage(root, initialData, imageType = "character") {
  const isScene = imageType === "scene";
  let data = initialData;
  let stopped = false;
  const selected = new Set();
  const filters = {
    query: "",
    character: "",
    tags: [],
    type: imageType,
    approval: "",
    sort: "newest",
  };
  let focus = false;
  const id = data.activity.id;
  teacherShell(
    root,
    isScene ? "scenes" : "gallery",
    data.activity,
    `${pageHeading(isScene ? "READ THE MOMENTS" : "MEET THE CHARACTERS", isScene ? "사건 분석" : "등장인물 갤러리", isScene ? "인상 깊은 사건과 선택한 이유, 본문 속 전개를 함께 읽고 장면 작품을 살펴보세요." : "인물의 성격과 본문 근거를 담은 우리 반의 해석을 모았습니다.", `${button("학생 참여 QR", "qr-code", "secondary", 'id="gallery-qr"')}`, true)}<label class="search-field gallery-search">${icon("search")}<input id="gallery-search" type="search" placeholder="${isScene ? "사건, 인물, 학생 번호로 검색" : "인물, 학생 번호, 해시태그로 검색"}" aria-label="작품 검색"/></label><details class="gallery-options"><summary>필터 · 보기 옵션 ${icon("chevron-down")}</summary><div class="gallery-toolbar"><div id="character-select"></div>${customSelect(
      {
        name: "approval",
        label: "승인 상태",
        value: "",
        options: [
          { value: "", label: "모든 승인 상태" },
          { value: "approved", label: "전시 승인" },
          { value: "pending", label: "승인 대기" },
          { value: "hidden", label: "비공개" },
        ],
      },
    )}${customSelect({
      name: "sort",
      label: "작품 정렬",
      value: "newest",
      options: [
        { value: "newest", label: "최근 제출순" },
        { value: "oldest", label: "오래된순" },
        { value: "student", label: "학생 번호순" },
        { value: "character", label: "인물 이름순" },
        { value: "frequency", label: "태그 빈도순" },
      ],
    })}</div><div class="gallery-tags" id="gallery-tags" ${isScene ? "hidden" : ""}></div><div class="flex wrap">${isScene ? "" : `<a class="btn secondary" href="/teacher/activity/${id}/analytics">${icon("chart-no-axes-combined")} 인물 해석 비교</a>`}${button("크게 보기", "maximize-2", "secondary", 'id="focus-view"')}<a class="btn secondary" href="/teacher/activity/${id}/showcase">${icon("play")} 전체 화면 전시</a></div></details>${isScene ? '<section class="scene-analysis-section" aria-labelledby="scene-analysis-heading"><div class="section-heading"><div><h2 id="scene-analysis-heading">학생들이 읽은 사건</h2><p>사진 제출 전에도 완성한 사건 분석을 확인할 수 있어요.</p></div><span id="scene-record-count" class="badge"></span></div><div id="scene-records" class="scene-records"></div></section><div class="section-heading"><h2>사건 장면 갤러리</h2></div>' : ""}<div class="between wrap" style="margin-bottom:22px"><span class="muted" style="font-size:12px" id="gallery-count"></span><label class="check-field" style="font-size:12px"><input type="checkbox" id="select-visible"/>현재 작품 전체 선택</label></div><div class="gallery-grid" id="gallery-grid"></div><div id="selection-slot"></div>`,
  );
  const grid = root.querySelector("#gallery-grid");
  root.querySelector("#gallery-qr").onclick = () => showQR(data.activity);
  const drawSceneRecords = () => {
    const query = filters.query.trim().toLocaleLowerCase();
    const records = data.worksheets.filter(
      (w) =>
        w.scene?.name &&
        (!filters.character || w.character_name === filters.character) &&
        (!query ||
          [w.student_label, w.character_name, ...Object.values(w.scene)]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query)),
    );
    root.querySelector("#scene-record-count").textContent =
      `${records.length}명 분석`;
    root.querySelector("#scene-records").innerHTML = records.length
      ? records
          .map((w) => {
            const hasImage = data.images.some(
              (image) =>
                image.image_type === "scene" && image.worksheet_id === w.id,
            );
            return `<details class="scene-record"><summary><span class="scene-record-meta">${e(w.student_label)} · ${e(w.character_name)}<span class="badge ${hasImage ? "blue" : ""}">${hasImage ? "장면 제출 완료" : "장면 제출 전"}</span></span><strong>${e(w.scene.name)}</strong><span class="scene-record-reason">${e(w.scene.reason)}</span><span class="text-link">분석 자세히 보기 ${icon("chevron-down")}</span></summary><dl>${[
              ["이 사건을 선택한 이유", w.scene.reason],
              ["본문에 나타난 사건의 전개", w.scene.development],
              ["사건 속 인물의 행동", w.scene.behavior],
              ["사진으로 표현할 장면", w.scene.visual],
            ]
              .map(
                ([label, value]) =>
                  `<div><dt>${label}</dt><dd>${e(value || "작성된 내용이 없습니다.")}</dd></div>`,
              )
              .join("")}</dl></details>`;
          })
          .join("")
      : `<div class="empty"><h3>${query || filters.character ? "검색한 사건 분석이 없어요." : "학생들의 첫 사건 분석을 기다리고 있어요."}</h3><p>${query || filters.character ? "검색어나 인물 필터를 바꿔 보세요." : "수업 설정에서 인물·사건 분석을 열고 학생 참여 QR을 안내해 주세요."}</p></div>`;
  };
  const refreshCharacters = () => {
    root.querySelector("#character-select").innerHTML = customSelect({
      name: "character",
      label: "등장인물",
      value: filters.character,
      options: [
        { value: "", label: "모든 인물" },
        ...[...new Set(data.worksheets.map((w) => w.character_name))].map(
          (x) => ({ value: x, label: x }),
        ),
      ],
    });
    initSelects(root);
  };
  refreshCharacters();
  const visible = () =>
    filterImages(data.images, data.worksheets, {
      ...filters,
      aliases: data.activity.aliases,
    });
  const drawSelection = () => {
    const images = visible();
    root.querySelector("#select-visible").checked =
      images.length > 0 && images.every((i) => selected.has(i.id));
    root.querySelector("#select-visible").indeterminate =
      images.some((i) => selected.has(i.id)) &&
      !images.every((i) => selected.has(i.id));
    root.querySelector("#selection-slot").innerHTML = selected.size
      ? `<div class="selection-bar"><span>${selected.size}개의 작품 선택</span><div class="flex">${button("해석 비교", "images", "primary", `id="compare-images" ${selected.size !== 2 ? "disabled" : ""}`)}${button("전시 승인", "check", "secondary", 'id="approve-selected"')}${button("삭제", "trash-2", "ghost", 'id="delete-selected"')}${button("선택 해제", "x", "ghost", 'id="clear-selected"')}</div></div>`
      : "";
    refreshIcons();
    root.querySelector("#compare-images")?.addEventListener("click", () =>
      compareArt(
        data.images.filter((i) => selected.has(i.id)),
        data,
      ),
    );
    root.querySelector("#clear-selected")?.addEventListener("click", () => {
      selected.clear();
      draw();
    });
    root
      .querySelector("#approve-selected")
      ?.addEventListener("click", async (ev) => {
        ev.currentTarget.disabled = true;
        try {
          await request("teacher/moderate", {
            id,
            ids: [...selected],
            status: "approved",
          });
          selected.clear();
          await reload();
          toast("선택한 작품을 전시 승인했어요.");
        } catch (error) {
          toast(error.message, "error");
          drawSelection();
        }
      });
    root.querySelector("#delete-selected")?.addEventListener("click", () =>
      confirmDialog({
        title: `이미지 ${selected.size}개를 삭제할까요?`,
        message:
          "선택한 실제 이미지 파일을 삭제합니다. 학생의 분석 활동지는 보존됩니다.",
        confirm: `${selected.size}개 삭제`,
        danger: true,
        onConfirm: async () => {
          await request("teacher/delete-images", { id, ids: [...selected] });
          selected.clear();
          await reload();
        },
      }),
    );
  };
  const draw = (animate = false) => {
    const state =
      animate && !matchMedia("(prefers-reduced-motion:reduce)").matches
        ? Flip.getState(grid.querySelectorAll(".art-card"))
        : null;
    const images = visible();
    const filterCount =
      Number(Boolean(filters.character)) +
      Number(Boolean(filters.approval)) +
      filters.tags.length +
      Number(filters.sort !== "newest");
    root.querySelector(".gallery-options summary").innerHTML =
      `필터 · 보기 옵션${filterCount ? `<span class="badge">${filterCount}개 적용</span>` : ""} ${icon("chevron-down")}`;
    grid.classList.toggle("focus", focus);
    grid.innerHTML = images.length
      ? images
          .map((i) =>
            artCard(i, data.worksheets, {
              selectable: true,
              selected: selected.has(i.id),
            }),
          )
          .join("")
      : `<div class="empty" style="grid-column:1/-1">${icon("images")}<h3>아직 이 시선으로 표현한 작품이 없어요.</h3><p>필터를 바꾸거나 새로운 작품을 기다려 주세요.</p></div>`;
    grid
      .querySelectorAll(".art-card")
      .forEach((el) => (el.dataset.flipId = el.dataset.artId));
    root.querySelector("#gallery-count").textContent =
      `전체 ${data.images.filter((image) => image.image_type === imageType).length}점 중 ${images.length}점${filters.tags.length ? " · 선택한 모든 태그를 포함하는 작품" : ""}`;
    const tags = tagStatistics(
      data.images.filter((image) => image.image_type === imageType),
      data.worksheets,
      data.activity.aliases,
    ).tags;
    root.querySelector("#gallery-tags").innerHTML =
      `<button class="tag-button ${filters.tags.length ? "" : "active"}" data-tag="">전체 시선</button>${tags.map(({ tag, count }) => `<button class="tag-button ${filters.tags.includes(tag) ? "active" : ""}" data-tag="${e(tag)}" aria-pressed="${filters.tags.includes(tag)}">#${e(tag)} <span style="opacity:.5;margin-left:5px">${count}</span></button>`).join("")}`;
    if (isScene) drawSceneRecords();
    drawSelection();
    if (state)
      Flip.from(state, {
        duration: 0.4,
        ease: "power2.out",
        absolute: true,
        onEnter: (els) =>
          gsap.fromTo(
            els,
            { opacity: 0, y: 12 },
            { opacity: 1, y: 0, duration: 0.35 },
          ),
      });
    refreshIcons();
  };
  const reload = async () => {
    const next = await request("teacher/get", { id });
    if (stopped) return;
    data = next;
    for (const key of selected)
      if (!data.images.some((i) => i.id === key)) selected.delete(key);
    refreshCharacters();
    draw();
  };
  root.querySelector("#gallery-search").addEventListener(
    "input",
    debounce((ev) => {
      if (stopped) return;
      filters.query = ev.target.value;
      draw(true);
    }, 150),
  );
  root.querySelector(".gallery-toolbar").addEventListener("change", (ev) => {
    if (ev.target.name) {
      filters[ev.target.name] = ev.target.value;
      draw(true);
    }
  });
  root.querySelector("#gallery-tags").onclick = (ev) => {
    const node = ev.target.closest("[data-tag]");
    if (!node) return;
    const tag = node.dataset.tag;
    filters.tags = !tag
      ? []
      : filters.tags.includes(tag)
        ? filters.tags.filter((t) => t !== tag)
        : [...filters.tags, tag];
    draw(true);
  };
  root.querySelector("#focus-view").onclick = (ev) => {
    focus = !focus;
    ev.currentTarget.innerHTML = `${icon(focus ? "minimize-2" : "maximize-2")}<span>${focus ? "그리드 보기" : "크게 보기"}</span>`;
    draw(true);
  };
  root.querySelector("#select-visible").onchange = (ev) => {
    visible().forEach((i) =>
      ev.target.checked ? selected.add(i.id) : selected.delete(i.id),
    );
    draw();
  };
  grid.addEventListener("change", (ev) => {
    const key = ev.target.dataset.selectImage;
    if (!key) return;
    ev.target.checked ? selected.add(key) : selected.delete(key);
    ev.target
      .closest(".art-card")
      .classList.toggle("selected", ev.target.checked);
    drawSelection();
  });
  grid.onclick = async (ev) => {
    const key = ev.target.closest("[data-open-art]")?.dataset.openArt;
    if (key)
      showArt(
        data.images.find((i) => i.id === key),
        data,
        { onChange: reload },
      );
  };
  draw();
  initSelects(root);
  const unsub = subscribe(id, () =>
    reload().catch((error) => toast(error.message, "error")),
  );
  return () => {
    stopped = true;
    unsub();
    gsap.killTweensOf(grid.querySelectorAll(".art-card"));
  };
}
export function analyticsPage(root, initialData) {
  let data = initialData;
  let stopped = false;
  const id = data.activity.id;
  let character = data.worksheets[0]?.character_name || "";
  let approval = "approved";
  let active = "";
  teacherShell(
    root,
    "analytics",
    data.activity,
    `${pageHeading("THE CONSTELLATION OF INTERPRETATIONS", "같은 인물, 다른 마음.", "인물 사진의 키워드로 우리 반의 다양한 성격 해석을 살펴보세요. 사건과 장면은 이 수업의 사건 분석 탭에서 확인합니다.", button("태그 묶기", "sliders-horizontal", "secondary", 'id="edit-aliases"'))}<div class="gallery-toolbar">${customSelect({ name: "character", label: "분석할 인물", value: character, options: [{ value: "", label: "모든 인물 (합산)" }, ...[...new Set(data.worksheets.map((w) => w.character_name))]] })}${customSelect(
      {
        name: "approval",
        label: "분석 대상",
        value: "approved",
        options: [
          { value: "approved", label: "승인된 작품만" },
          { value: "", label: "모든 제출 작품" },
        ],
      },
    )}<span id="sample-size" class="muted" style="font-size:12px;margin-left:auto"></span></div><div class="analytics-layout"><section class="constellation" id="constellation" aria-label="성격 키워드 관계도"></section><aside class="panel ranking-panel"><span class="eyebrow">PERSONALITY DISTRIBUTION</span><h3 style="margin-top:12px">해석의 스펙트럼</h3><p class="muted" style="font-size:11px;margin-top:10px">학생별 중복 태그를 제외한 인원입니다.<br/>한 학생이 여러 키워드에 포함될 수 있어요.</p><div class="ranking" id="ranking"></div></aside></div><div class="section-heading" style="margin-top:35px"><div><h2 id="filtered-title">시선으로 이어지는 작품</h2><p id="filtered-subtitle"></p></div>${button("전체 시선", "rotate-ccw", "ghost", 'id="reset-tag"')}</div><div class="gallery-grid" id="analytics-art"></div>`,
  );
  const base = () =>
    filterImages(data.images, data.worksheets, {
      character,
      approval,
      type: "character",
    });
  const draw = () => {
    const images = base();
    const stats = tagStatistics(images, data.worksheets, data.activity.aliases);
    root.querySelector("#sample-size").textContent =
      `${character || "모든 인물 합산"} · ${approval ? "승인된 작품" : "모든 제출 작품"} · 학생 ${stats.total}명 / 작품 ${images.length}점`;
    const top = stats.tags.slice(0, 9);
    const locations = top.map((t, i) => ({
      x:
        50 +
        Math.cos((i / top.length) * Math.PI * 2 - Math.PI / 2) *
          (top.length === 1 ? 0 : 31),
      y:
        48 +
        Math.sin((i / top.length) * Math.PI * 2 - Math.PI / 2) *
          (top.length === 1 ? 0 : 30),
    }));
    const lines = stats.pairs
      .map((pair) => {
        const ai = top.findIndex((t) => t.tag === pair.tags[0]),
          bi = top.findIndex((t) => t.tag === pair.tags[1]);
        if (ai < 0 || bi < 0) return "";
        return `<line x1="${locations[ai].x}" y1="${locations[ai].y}" x2="${locations[bi].x}" y2="${locations[bi].y}" stroke-width="${Math.min(0.7, 0.1 + pair.count * 0.1)}"><title>${e(pair.tags.join(" + "))} · 함께 사용한 학생 ${pair.count}명</title></line>`;
      })
      .join("");
    root.querySelector("#constellation").innerHTML = top.length
      ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${top
          .map((t, i) => {
            const size =
              (innerWidth < 520 ? 54 : 68) +
              Math.sqrt(t.count / (stats.total || 1)) * 45;
            return `<button class="node ${active && active !== t.tag ? "dim" : ""} ${active === t.tag ? "active" : ""}" data-node="${e(t.tag)}" style="left:${locations[i].x}%;top:${locations[i].y}%;width:${size}px;height:${size}px" aria-pressed="${active === t.tag}" aria-label="${e(t.tag)}, ${t.count}명, ${t.percent}퍼센트"><strong>#${e(t.tag)}</strong><small>${t.count}명 · ${t.percent}%</small></button>`;
          })
          .join(
            "",
          )}<span class="chart-legend">선 = 같은 학생이 함께 사용한 태그 · 상위 ${top.length}개 키워드</span>`
      : '<div class="empty" style="border:0">아직 분석할 작품이 없어요.<br/>작품을 승인하거나 분석 대상을 바꿔 주세요.</div>';
    root.querySelector("#ranking").innerHTML =
      stats.tags
        .map(
          (t) =>
            `<button class="rank-row" data-node="${e(t.tag)}" aria-pressed="${active === t.tag}"><div class="between"><span>#${e(t.tag)}</span><span>${t.count}명 · ${t.percent}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${t.percent}%"></div></div></button>`,
        )
        .join("") ||
      '<span class="muted" style="font-size:12px">아직 키워드가 없어요.</span>';
    const filtered = active
      ? filterImages(images, data.worksheets, {
          tags: [active],
          aliases: data.activity.aliases,
        })
      : images;
    root.querySelector("#filtered-title").textContent = active
      ? `#${active}, 이렇게 표현했어요.`
      : "시선으로 이어지는 작품";
    root.querySelector("#filtered-subtitle").textContent =
      `${filtered.length}점의 작품 · 작은 표본의 해석을 전체 인물의 성격으로 일반화하지 않아요.`;
    root.querySelector("#analytics-art").innerHTML = filtered.length
      ? filtered.map((i) => artCard(i, data.worksheets)).join("")
      : '<div class="empty" style="grid-column:1/-1">조건에 맞는 작품이 없습니다.</div>';
    refreshIcons();
  };
  const reload = async () => {
    const next = await request("teacher/get", { id });
    if (stopped) return;
    data = next;
    draw();
  };
  root.querySelector(".gallery-toolbar").onchange = (ev) => {
    if (ev.target.name === "character") character = ev.target.value;
    if (ev.target.name === "approval") approval = ev.target.value;
    active = "";
    draw();
  };
  const choose = (ev) => {
    const tag = ev.target.closest("[data-node]")?.dataset.node;
    if (tag) {
      active = active === tag ? "" : tag;
      draw();
    }
  };
  root.querySelector("#constellation").onclick = choose;
  root.querySelector("#ranking").onclick = choose;
  root.querySelector("#reset-tag").onclick = () => {
    active = "";
    draw();
  };
  root.querySelector("#analytics-art").onclick = (ev) => {
    const key = ev.target.closest("[data-open-art]")?.dataset.openArt;
    if (key)
      showArt(
        data.images.find((i) => i.id === key),
        data,
        { onChange: reload },
      );
  };
  root.querySelector("#edit-aliases").onclick = () => {
    let aliases = Object.entries(data.activity.aliases || {});
    if (!aliases.length) aliases = [["", ""]];
    const modal = openModal({
      title: "비슷한 태그를 함께 보기",
      eyebrow: "TAG ALIASES",
      body: `<p class="muted" style="font-size:13px;margin-bottom:22px">원래 입력은 보존합니다. 선생님이 지정한 대표 태그로만 통계를 묶고, 다른 의미의 태그를 자동으로 통합하지 않습니다.</p><div id="alias-list" class="stack"></div><div style="margin-top:15px">${button("매핑 추가", "plus", "ghost", 'id="add-alias"')}</div><p id="alias-error" class="step-error" role="alert"></p>`,
      footer: button("태그 매핑 저장", "check", "primary", 'id="save-alias"'),
    });
    const drawAliases = () => {
      modal.element.querySelector("#alias-list").innerHTML = aliases
        .map(
          ([from, to], i) =>
            `<div class="alias-row"><input aria-label="원본 태그 ${i + 1}" data-alias="${i}" data-side="0" value="${e(from)}" placeholder="예: 소극적" maxlength="20"/><span class="muted">→</span><input aria-label="대표 태그 ${i + 1}" data-alias="${i}" data-side="1" value="${e(to)}" placeholder="예: 소심함" maxlength="20"/><button class="icon-btn" data-remove-alias="${i}" aria-label="매핑 ${i + 1} 삭제">${icon("x")}</button></div>`,
        )
        .join("");
      refreshIcons();
    };
    drawAliases();
    modal.element.querySelector("#alias-list").oninput = (ev) => {
      if (ev.target.dataset.alias !== undefined)
        aliases[Number(ev.target.dataset.alias)][
          Number(ev.target.dataset.side)
        ] = ev.target.value;
    };
    modal.element.querySelector("#alias-list").onclick = (ev) => {
      const remove = ev.target.closest("[data-remove-alias]");
      if (remove) {
        aliases.splice(Number(remove.dataset.removeAlias), 1);
        drawAliases();
      }
    };
    modal.element.querySelector("#add-alias").onclick = () => {
      aliases.push(["", ""]);
      drawAliases();
    };
    modal.element.querySelector("#save-alias").onclick = async (ev) => {
      const mapping = {};
      for (const [from, to] of aliases) {
        if (!from.trim() && !to.trim()) continue;
        const f = normalizeTags([from])[0],
          t = normalizeTags([to])[0];
        if (!f || !t || f === t) {
          modal.element.querySelector("#alias-error").textContent =
            "서로 다른 유효한 원본·대표 태그를 입력해 주세요.";
          return;
        }
        mapping[f] = t;
      }
      if (Object.values(mapping).some((v) => Object.hasOwn(mapping, v))) {
        modal.element.querySelector("#alias-error").textContent =
          "대표 태그를 다른 매핑의 원본으로 사용할 수 없어요. 하나의 대표 태그로 직접 연결해 주세요.";
        return;
      }
      ev.currentTarget.disabled = true;
      try {
        await request("teacher/aliases", { id, aliases: mapping });
        modal.close();
        await reload();
        toast("태그 매핑을 저장했어요.");
      } catch (error) {
        toast(error.message, "error");
        ev.target.closest("button").disabled = false;
      }
    };
  };
  draw();
  initSelects(root);
  const unsub = subscribe(id, () =>
    reload().catch((error) => toast(error.message, "error")),
  );
  return () => {
    stopped = true;
    unsub();
  };
}
