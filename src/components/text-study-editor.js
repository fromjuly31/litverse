import { icon, button, field, refreshIcons, initPasswordFields } from "./ui.js";
import { e } from "../utils/helpers.js";
import {
  textStudyValue,
  textStudySchema,
  MAX_PDF_BYTES,
  MAX_PARAGRAPHS,
} from "../utils/text-study.js";
import { readLessonPdf } from "../services/lesson-pdf.js";

export function textStudyEditorView(activity) {
  const study = textStudyValue(activity);
  return `<section class="panel editor-section text-study-editor"><label class="check-field text-study-toggle"><input type="checkbox" id="enable-text-study" ${study.enabled ? "checked" : ""}/><span><strong>본문 학습 사용하기 <small>선택</small></strong><span>PDF에서 본문을 골라 문단별로 함께 읽고 낭독해요.</span></span></label>
    <div id="text-study-setup" ${study.enabled ? "" : "hidden"}>
      <div class="pdf-attach"><label class="btn secondary pdf-file-label">${icon("upload")} PDF 첨부<input type="file" id="lesson-pdf" accept="application/pdf,.pdf" aria-label="본문 PDF 첨부"/></label><span id="pdf-source-name">${e(study.source_name || "텍스트 PDF와 스캔 PDF 모두 가능 · 40MB 이하")}</span>${button("첨부된 PDF 열기", "book-open", "secondary", `id="open-lesson-pdf" ${study.source_id ? "" : "hidden"}`)}</div>
      <p class="pdf-status" id="pdf-status" role="status">PDF를 열고 본문에 해당하는 영역을 클릭해 주세요. 스캔 페이지는 ‘문자 인식’으로 글자를 읽어요.</p><div id="pdf-password"></div>
      <div class="pdf-import-grid"><section class="pdf-preview-panel" aria-label="PDF 본문 미리보기"><div class="pdf-toolbar"><button type="button" class="icon-btn" id="pdf-prev" aria-label="이전 PDF 페이지" disabled>${icon("arrow-left")}</button><span id="pdf-page-number">PDF 미리보기</span><button type="button" class="pdf-zoom-control" id="pdf-zoom-out" aria-label="PDF 축소" disabled>−</button><span id="pdf-zoom-value">100%</span><button type="button" class="pdf-zoom-control" id="pdf-zoom-in" aria-label="PDF 확대" disabled>+</button><button type="button" class="icon-btn" id="pdf-next" aria-label="다음 PDF 페이지" disabled>${icon("arrow-right")}</button><label class="sr-only" for="pdf-page-input">PDF 페이지 이동</label><input type="number" id="pdf-page-input" min="1" value="1" aria-label="PDF 페이지 이동" disabled/><button type="button" class="btn ghost" id="pdf-go" disabled>이동</button></div>
      <div class="pdf-stage" id="pdf-stage"><div class="pdf-placeholder">${icon("file-text")}<p>첨부한 PDF가 이곳에 표시됩니다.</p></div></div><div class="pdf-page-actions">${button("현재 페이지 문자 인식", "sparkles", "secondary", 'id="pdf-ocr" disabled')}${button("인식 중단", "x", "secondary", 'id="pdf-cancel-ocr" hidden')}${button("이 페이지 본문 모두 선택", "plus", "ghost", 'id="pdf-select-page" disabled')}</div></section>
      <section class="pdf-selected-panel" aria-label="선택한 본문 문단"><div class="between"><h3>선택한 본문 <span id="paragraph-count">${study.paragraphs.length}</span></h3>${button("직접 추가", "plus", "ghost", 'id="add-paragraph"')}</div><p class="pdf-edit-hint">본문 순서를 바꾸거나 인식된 글자를 다듬어 주세요. 줄바꿈한 글은 ‘나누기’로 분리할 수 있어요.</p><div id="selected-paragraphs"></div><p class="step-error" id="text-study-error" role="alert"></p></section></div>
    </div></section>`;
}

export function bindTextStudyEditor(root, activity) {
  const state = structuredClone(textStudyValue(activity));
  let pdf,
    loadingTask,
    selectedFile,
    needsUpload = false,
    pageNumber = 1,
    zoom = 100,
    blocks = [],
    rendering,
    generation = 0,
    fileGeneration = 0,
    stopped = false,
    busy = false,
    ocr,
    ocrPending;
  const pageCache = new Map();
  const section = root.querySelector(".text-study-editor");
  const status = section.querySelector("#pdf-status");
  const error = section.querySelector("#text-study-error");
  const stage = section.querySelector("#pdf-stage");
  const list = section.querySelector("#selected-paragraphs");
  const enable = section.querySelector("#enable-text-study");
  const selectionId = (block) => `${state.source_id}/${block.id}`;
  const notify = () =>
    section.dispatchEvent(
      new CustomEvent("text-study-change", { bubbles: true }),
    );
  const setStatus = (text) => {
    if (!stopped) status.textContent = text;
  };
  const updateControls = () => {
    section.querySelector("#pdf-zoom-out").disabled =
      !pdf || busy || zoom <= 100;
    section.querySelector("#pdf-zoom-in").disabled =
      !pdf || busy || zoom >= 200;
    section.querySelector("#pdf-zoom-value").textContent = `${zoom}%`;
    section.querySelector("#pdf-prev").disabled =
      !pdf || pageNumber <= 1 || busy;
    section.querySelector("#pdf-next").disabled =
      !pdf || pageNumber >= pdf.numPages || busy;
    section.querySelector("#pdf-page-input").disabled = !pdf || busy;
    section.querySelector("#pdf-go").disabled = !pdf || busy;
    section.querySelector("#pdf-ocr").disabled = !pdf || busy;
    section.querySelector("#pdf-select-page").disabled = !blocks.length || busy;
    section.querySelector("#pdf-page-number").textContent = pdf
      ? `${pageNumber} / ${pdf.numPages} 페이지`
      : "PDF 미리보기";
    section.querySelector("#pdf-page-input").value = pageNumber;
    section.querySelector("#pdf-page-input").max = pdf?.numPages || 1;
    section.querySelector("#pdf-cancel-ocr").hidden = !ocrPending;
  };
  const updateHighlights = () =>
    stage.querySelectorAll("[data-pdf-block]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(
          state.paragraphs.some(
            (paragraph) =>
              paragraph.id ===
              selectionId(blocks[Number(button.dataset.pdfBlock)]),
          ),
        ),
      );
    });
  const drawSelected = () => {
    section.querySelector("#paragraph-count").textContent =
      state.paragraphs.length;
    list.innerHTML = state.paragraphs.length
      ? state.paragraphs
          .map(
            (paragraph, index) =>
              `<article class="selected-paragraph"><div class="selected-paragraph-heading"><strong>문단 ${index + 1}</strong><small>${paragraph.page ? `PDF ${paragraph.page}쪽` : "직접 입력"}</small><button type="button" class="icon-btn" data-delete-paragraph="${index}" aria-label="문단 ${index + 1} 삭제">${icon("x")}</button></div><textarea data-paragraph="${index}" aria-label="본문 문단 ${index + 1}" maxlength="12000">${e(paragraph.text)}</textarea><div class="paragraph-actions"><button type="button" class="btn ghost" data-move-paragraph="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""} aria-label="문단 ${index + 1} 위로">${icon("move-up")} 위로</button><button type="button" class="btn ghost" data-move-paragraph="${index}" data-direction="1" ${index === state.paragraphs.length - 1 ? "disabled" : ""} aria-label="문단 ${index + 1} 아래로">${icon("move-down")} 아래로</button><button type="button" class="btn ghost" data-split-paragraph="${index}" aria-label="문단 ${index + 1} 나누기">나누기</button><button type="button" class="btn ghost" data-merge-paragraph="${index}" ${index === state.paragraphs.length - 1 ? "disabled" : ""} aria-label="문단 ${index + 1} 다음 문단과 합치기">다음과 합치기</button></div></article>`,
          )
          .join("")
      : '<div class="pdf-selection-empty">미리보기에서 본문을 선택하면<br/>문단이 이곳에 추가됩니다.</div>';
    updateHighlights();
    refreshIcons();
    notify();
  };
  const addBlock = (block) => {
    const id = selectionId(block);
    if (state.paragraphs.some((paragraph) => paragraph.id === id)) return;
    if (state.paragraphs.length >= MAX_PARAGRAPHS)
      throw new Error("본문은 최대 300문단까지 선택할 수 있어요.");
    state.paragraphs.push({
      id,
      text: block.text,
      page: block.page,
      source_name: state.source_name,
    });
  };
  const drawBlocks = () => {
    const overlay = stage.querySelector(".pdf-text-overlay");
    if (!overlay) return;
    overlay.innerHTML = blocks
      .map(
        (block, index) =>
          `<button type="button" class="pdf-block" data-pdf-block="${index}" aria-label="본문 선택: ${e(block.text.slice(0, 100))}" aria-pressed="false" title="${e(block.text)}" style="left:${block.rect.x * 100}%;top:${block.rect.y * 100}%;width:${block.rect.width * 100}%;height:${block.rect.height * 100}%"><span class="sr-only">${e(block.text)}</span></button>`,
      )
      .join("");
    updateHighlights();
    updateControls();
  };
  async function drawPage() {
    if (!pdf || stopped) return;
    const id = ++generation;
    rendering?.cancel();
    busy = true;
    updateControls();
    try {
      const page = await pdf.getPage(pageNumber);
      if (id !== generation || stopped) return;
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 1300 / base.width);
      const viewport = page.getViewport({ scale });
      stage.innerHTML = `<div class="pdf-paper" style="aspect-ratio:${viewport.width}/${viewport.height};width:${zoom}%"><canvas aria-label="PDF ${pageNumber}페이지"></canvas><div class="pdf-text-overlay"></div></div>`;
      const canvas = stage.querySelector("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      rendering = page.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
      });
      await rendering.promise;
      if (id !== generation || stopped) return;
      if (!pageCache.has(pageNumber)) {
        const { pdfTextParagraphs } = await import("../services/pdf-engine.js");
        pageCache.set(pageNumber, await pdfTextParagraphs(page, pageNumber));
      }
      blocks = pageCache.get(pageNumber);
      drawBlocks();
      setStatus(
        blocks.length
          ? `본문 영역 ${blocks.length}개를 찾았어요. 사용할 부분을 클릭해 주세요.`
          : "이 페이지는 스캔 이미지일 수 있어요. ‘현재 페이지 문자 인식’을 눌러 주세요.",
      );
    } catch (reason) {
      if (reason.name !== "RenderingCancelledException" && !stopped)
        setStatus(
          "PDF 페이지를 표시하지 못했어요. 다른 페이지를 열거나 파일을 다시 첨부해 주세요.",
        );
    } finally {
      if (id === generation) {
        busy = false;
        updateControls();
      }
    }
  }
  async function loadFile(file, existing = false) {
    if (!file) return;
    const fileToken = ++fileGeneration;
    const token = ++generation;
    rendering?.cancel();
    if (ocrPending) {
      ocrPending = false;
      const previousOcr = ocr;
      ocr = null;
      previousOcr?.terminate();
    }
    busy = true;
    updateControls();
    setStatus("PDF를 읽고 있어요…");
    error.textContent = "";
    try {
      if (file.size > MAX_PDF_BYTES)
        throw new Error("PDF는 40MB 이하로 첨부해 주세요.");
      const bytes = await file.arrayBuffer();
      if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
        throw new Error("올바른 PDF 파일을 첨부해 주세요.");
      await loadingTask?.destroy();
      const { openPdf } = await import("../services/pdf-engine.js");
      if (stopped || token !== generation) return;
      const document = await openPdf(
        bytes,
        (update) => {
          if (stopped || token !== generation)
            return update(new Error("파일 열기를 취소했어요."));
          const area = section.querySelector("#pdf-password");
          area.innerHTML = `${field("PDF 암호", "pdf_password", "", { type: "password", autocomplete: "off" })}${button("PDF 열기", "lock-keyhole", "secondary", 'id="unlock-pdf"')}<p>암호가 있는 PDF입니다. 문서 암호를 입력해 주세요.</p>`;
          initPasswordFields(area);
          refreshIcons();
          area.querySelector("#unlock-pdf").onclick = () =>
            update(area.querySelector("input").value);
        },
        (task) => {
          loadingTask = task;
        },
      );
      if (stopped || token !== generation) {
        await document.loadingTask.destroy();
        return;
      }
      await pdf?.loadingTask.destroy();
      pdf = document;
      loadingTask = null;
      selectedFile = file;
      needsUpload = !existing;
      if (!existing) state.source_id = crypto.randomUUID();
      state.source_name = file.name;
      section.querySelector("#pdf-source-name").textContent = file.name;
      section.querySelector("#pdf-password").replaceChildren();
      pageNumber = 1;
      zoom = 100;
      section.querySelector("#open-lesson-pdf").hidden = true;
      pageCache.clear();
      blocks = [];
      busy = false;
      await drawPage();
    } catch (reason) {
      if (!stopped)
        setStatus(
          reason.message || "PDF를 읽지 못했어요. 파일을 확인해 주세요.",
        );
    } finally {
      if (!stopped && fileToken === fileGeneration) {
        busy = false;
        updateControls();
        notify();
      }
    }
  }
  async function recognizePage() {
    if (!pdf || busy) return;
    busy = true;
    ocrPending = true;
    updateControls();
    const currentPage = pageNumber;
    const token = ++generation;
    try {
      setStatus(
        "한국어·영어 문자 인식을 준비하고 있어요. 첫 실행에는 잠시 시간이 걸릴 수 있어요.",
      );
      const { createOcr } = await import("../services/ocr-engine.js");
      if (stopped || token !== generation) return;
      const worker =
        ocr ||
        (await createOcr((progress) => {
          if (!ocrPending || stopped) return;
          const labels = {
            "loading tesseract core": "문자 인식 엔진 준비",
            "loading language traineddata": "한국어·영어 데이터 준비",
            "initializing api": "문자 인식 초기화",
            "recognizing text": "본문 문자 인식",
          };
          setStatus(
            `${labels[progress.status] || "문자 인식 준비"} · ${Math.round((progress.progress || 0) * 100)}%`,
          );
        }));
      if (stopped || token !== generation) {
        await worker.terminate();
        return;
      }
      ocr = worker;
      const page = await pdf.getPage(currentPage);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(3, 2200 / Math.max(base.width, base.height)),
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport })
        .promise;
      const result = await worker.recognize(canvas, currentPage);
      if (stopped || token !== generation) return;
      blocks = result;
      pageCache.set(currentPage, blocks);
      drawBlocks();
      setStatus(
        blocks.length
          ? `문자 인식으로 본문 영역 ${blocks.length}개를 찾았어요. 선택 후 인식된 글자를 확인해 주세요.`
          : "이 페이지에서 글자를 찾지 못했어요. ‘직접 추가’로 입력하거나 더 선명한 PDF를 첨부해 주세요.",
      );
    } catch (reason) {
      if (!stopped && token === generation)
        setStatus(
          "문자 인식을 완료하지 못했어요. 다시 시도하거나 본문을 직접 입력해 주세요.",
        );
    } finally {
      if (!stopped && token === generation) {
        busy = false;
        ocrPending = false;
        updateControls();
      }
    }
  }
  enable.onchange = () => {
    state.enabled = enable.checked;
    section.querySelector("#text-study-setup").hidden = !enable.checked;
    notify();
  };
  section.querySelector("#lesson-pdf").onchange = (event) =>
    loadFile(event.target.files[0]);
  section.querySelector("#open-lesson-pdf").onclick = async () => {
    try {
      await loadFile(
        await readLessonPdf(activity.id, state.source_id, state.source_name),
        true,
      );
    } catch (reason) {
      setStatus(reason.message);
    }
  };
  const go = (page) => {
    if (
      pdf &&
      !busy &&
      Number.isInteger(page) &&
      page >= 1 &&
      page <= pdf.numPages
    ) {
      pageNumber = page;
      drawPage();
    }
  };
  section.querySelector("#pdf-prev").onclick = () => go(pageNumber - 1);
  section.querySelector("#pdf-next").onclick = () => go(pageNumber + 1);
  section.querySelector("#pdf-go").onclick = () =>
    go(Number(section.querySelector("#pdf-page-input").value));
  section.querySelector("#pdf-page-input").onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      go(Number(event.target.value));
    }
  };
  const setZoom = (value) => {
    zoom = Math.max(100, Math.min(200, value));
    const paper = stage.querySelector(".pdf-paper");
    if (paper) paper.style.width = `${zoom}%`;
    updateControls();
  };
  section.querySelector("#pdf-zoom-in").onclick = () => setZoom(zoom + 25);
  section.querySelector("#pdf-zoom-out").onclick = () => setZoom(zoom - 25);
  section.querySelector("#pdf-ocr").onclick = recognizePage;
  section.querySelector("#pdf-cancel-ocr").onclick = async () => {
    generation++;
    await ocr?.terminate();
    ocr = null;
    busy = false;
    ocrPending = false;
    updateControls();
    setStatus("문자 인식을 중단했어요.");
  };
  stage.onclick = (event) => {
    const target = event.target.closest("[data-pdf-block]");
    if (!target || busy) return;
    const block = blocks[Number(target.dataset.pdfBlock)];
    const index = state.paragraphs.findIndex(
      (paragraph) => paragraph.id === selectionId(block),
    );
    try {
      if (index >= 0) state.paragraphs.splice(index, 1);
      else addBlock(block);
      drawSelected();
    } catch (reason) {
      error.textContent = reason.message;
    }
  };
  section.querySelector("#pdf-select-page").onclick = () => {
    try {
      blocks.forEach(addBlock);
      drawSelected();
    } catch (reason) {
      error.textContent = reason.message;
    }
  };
  section.querySelector("#add-paragraph").onclick = () => {
    if (state.paragraphs.length >= MAX_PARAGRAPHS) {
      error.textContent = "본문은 최대 300문단까지 추가할 수 있어요.";
      return;
    }
    state.paragraphs.push({ id: crypto.randomUUID(), text: "" });
    drawSelected();
    list.querySelector("article:last-child textarea").focus();
  };
  list.oninput = (event) => {
    if (event.target.dataset.paragraph !== undefined) {
      state.paragraphs[Number(event.target.dataset.paragraph)].text =
        event.target.value;
      error.textContent = "";
      notify();
    }
  };
  list.onclick = (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.deleteParagraph !== undefined)
      state.paragraphs.splice(Number(button.dataset.deleteParagraph), 1);
    if (button.dataset.moveParagraph !== undefined) {
      const index = Number(button.dataset.moveParagraph),
        next = index + Number(button.dataset.direction);
      [state.paragraphs[index], state.paragraphs[next]] = [
        state.paragraphs[next],
        state.paragraphs[index],
      ];
    }
    if (button.dataset.mergeParagraph !== undefined) {
      const index = Number(button.dataset.mergeParagraph);
      state.paragraphs[index].text += `\n${state.paragraphs[index + 1].text}`;
      state.paragraphs.splice(index + 1, 1);
    }
    if (button.dataset.splitParagraph !== undefined) {
      const index = Number(button.dataset.splitParagraph),
        paragraph = state.paragraphs[index];
      const parts = paragraph.text
        .split(/\n+/)
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length < 2) {
        error.textContent = "나눌 위치에서 줄바꿈한 뒤 ‘나누기’를 눌러 주세요.";
        return;
      }
      if (state.paragraphs.length + parts.length - 1 > MAX_PARAGRAPHS) {
        error.textContent = "본문은 최대 300문단까지 추가할 수 있어요.";
        return;
      }
      state.paragraphs.splice(
        index,
        1,
        ...parts.map((text) => ({
          ...paragraph,
          id: crypto.randomUUID(),
          text,
        })),
      );
    }
    drawSelected();
  };
  drawSelected();
  updateControls();
  return {
    value: () => ({
      ...state,
      enabled: enable.checked,
      paragraphs: state.paragraphs
        .filter((paragraph) => enable.checked || paragraph.text.trim())
        .map((paragraph) => ({ ...paragraph, text: paragraph.text.trim() })),
    }),
    file: () => (needsUpload ? selectedFile : null),
    problem() {
      if (enable.checked && busy)
        return "PDF 읽기 또는 문자 인식이 끝난 뒤 저장해 주세요.";
      const result = textStudySchema.safeParse(this.value());
      return result.success
        ? ""
        : result.error.issues[0].message ===
            "Too small: expected string to have >=1 characters"
          ? "비어 있는 본문 문단을 입력하거나 삭제해 주세요."
          : result.error.issues[0].message;
    },
    dispose() {
      stopped = true;
      generation++;
      fileGeneration++;
      rendering?.cancel();
      loadingTask?.destroy();
      pdf?.loadingTask.destroy();
      ocr?.terminate();
    },
  };
}
