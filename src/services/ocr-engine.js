import { createWorker } from "tesseract.js";
import workerSource from "tesseract.js/dist/worker.min.js?raw";
import { assetUrl } from "../utils/paths.js";

export async function createOcr(onProgress) {
  // The single-file edition maps worker resources to its embedded copies.
  const embedded = globalThis.__LITVERSE_ASSETS__;
  const resources = embedded
    ? Object.fromEntries(
        Object.entries(embedded)
          .filter(([path]) => path.startsWith("/document-assets/ocr/"))
          .map(([path, value]) => [path.split("/").at(-1), value]),
      )
    : null;
  const prefix = resources
    ? `const resources=${JSON.stringify(resources)}; const originalFetch=self.fetch.bind(self);self.fetch=(url,...args)=>originalFetch(resources[String(url).split('/').pop()]||url,...args); const originalImport=self.importScripts.bind(self);self.importScripts=(...urls)=>originalImport(...urls.map(url=>resources[String(url).split('/').pop()]||url));\n`
    : "";
  const url = URL.createObjectURL(
    new Blob([prefix, workerSource], { type: "text/javascript" }),
  );
  try {
    const worker = await createWorker(["kor", "eng"], 1, {
      workerPath: url,
      workerBlobURL: false,
      corePath: assetUrl("/document-assets/ocr/core/"),
      langPath: assetUrl("/document-assets/ocr/lang/"),
      logger: onProgress,
    });
    return {
      recognize: async (canvas, number) => {
        const { data } = await worker.recognize(
          canvas,
          { rotateAuto: true },
          { text: true, blocks: true },
        );
        return (data.blocks || [])
          .flatMap((block) => block.paragraphs || [])
          .filter((paragraph) => paragraph.text.trim())
          .map((paragraph, index) => ({
            id: `${number}:ocr:${index}`,
            page: number,
            text: paragraph.text.trim(),
            rect: {
              x: paragraph.bbox.x0 / canvas.width,
              y: paragraph.bbox.y0 / canvas.height,
              width: (paragraph.bbox.x1 - paragraph.bbox.x0) / canvas.width,
              height: (paragraph.bbox.y1 - paragraph.bbox.y0) / canvas.height,
            },
          }));
      },
      terminate: async () => {
        await worker.terminate();
        URL.revokeObjectURL(url);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
