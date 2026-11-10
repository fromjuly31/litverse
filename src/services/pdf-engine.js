import {
  getDocument,
  GlobalWorkerOptions,
  Util,
} from "pdfjs-dist/build/pdf.mjs";
import workerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";
import { assetUrl } from "../utils/paths.js";
import { textParagraphs } from "../utils/text-study.js";

let workerUrl;
class LocalBinaryData {
  async fetch({ kind, filename }) {
    const folder = {
      cMapUrl: "cmaps",
      standardFontDataUrl: "standard_fonts",
      wasmUrl: "wasm",
    }[kind];
    if (!folder || filename.includes("/") || filename.includes("\\"))
      throw new Error("PDF 리소스를 불러올 수 없어요.");
    const response = await fetch(
      assetUrl(`/document-assets/pdf/${folder}/${filename}`),
    );
    if (!response.ok) throw new Error("PDF 글꼴을 불러오지 못했어요.");
    return new Uint8Array(await response.arrayBuffer());
  }
}
export async function openPdf(bytes, onPassword, onTask) {
  workerUrl ||= URL.createObjectURL(
    new Blob([workerSource], { type: "text/javascript" }),
  );
  GlobalWorkerOptions.workerSrc = workerUrl;
  const task = getDocument({
    data: new Uint8Array(bytes),
    BinaryDataFactory: LocalBinaryData,
    useWorkerFetch: false,
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: true,
  });
  task.onPassword = onPassword;
  onTask?.(task);
  return task.promise;
}
export async function pdfTextParagraphs(page, number) {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = content.items
    .filter((item) => item.str?.trim())
    .map((item) => {
      const tx = Util.transform(viewport.transform, item.transform);
      const height = Math.hypot(tx[2], tx[3]);
      return {
        text: item.str,
        x: tx[4],
        y: tx[5] - height * 0.85,
        width: Math.max(item.width, height * 0.3),
        height,
      };
    });
  return textParagraphs(items, viewport.width, viewport.height, number);
}
