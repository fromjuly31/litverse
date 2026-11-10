import { readdirSync, readFileSync } from "node:fs";
import { resolve, extname } from "node:path";

// Keep document processing local to the site, including Korean OCR models.
export function documentAssets() {
  const files = new Map();
  const add = (name, path) =>
    files.set(`/document-assets/${name}`, resolve(path));
  for (const [folder, extensions] of [
    ["cmaps", [".bcmap"]],
    ["standard_fonts", [".pfb", ".ttf"]],
    ["wasm", [".wasm", ".js"]],
  ]) {
    for (const name of readdirSync(`node_modules/pdfjs-dist/${folder}`)) {
      if (extensions.includes(extname(name)) || name.startsWith("LICENSE"))
        add(
          `pdf/${folder}/${name}`,
          `node_modules/pdfjs-dist/${folder}/${name}`,
        );
    }
  }
  for (const variant of ["lstm", "simd-lstm", "relaxedsimd-lstm"])
    add(
      `ocr/core/tesseract-core-${variant}.wasm.js`,
      `node_modules/tesseract.js-core/tesseract-core-${variant}.wasm.js`,
    );
  for (const lang of ["kor", "eng"])
    add(
      `ocr/lang/${lang}.traineddata.gz`,
      `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    );
  add("pdf/LICENSE", "node_modules/pdfjs-dist/LICENSE");
  add("ocr/LICENSE", "node_modules/tesseract.js-core/LICENSE");
  add("ocr/LICENSE_TESSERACT.md", "node_modules/tesseract.js/LICENSE.md");
  return {
    name: "litverse-document-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (!files.has(path)) return next();
        res.setHeader(
          "Content-Type",
          path.endsWith(".js")
            ? "text/javascript"
            : path.endsWith(".wasm")
              ? "application/wasm"
              : "application/octet-stream",
        );
        res.end(readFileSync(files.get(path)));
      });
    },
    generateBundle() {
      for (const [path, file] of files)
        this.emitFile({
          type: "asset",
          fileName: path.slice(1),
          source: readFileSync(file),
        });
    },
  };
}
