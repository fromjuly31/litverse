import { build } from "vite";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "github-pages");
const release = resolve(root, "release");

// This static edition intentionally has no server credentials or live API calls.
await build({
  root,
  mode: "pages",
  base: "./",
  define: {
    "import.meta.env.VITE_APP_MODE": JSON.stringify("demo"),
    "import.meta.env.VITE_ROUTER_MODE": JSON.stringify("hash"),
    "import.meta.env.VITE_PUBLIC_SITE_URL": JSON.stringify(""),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(""),
  },
  build: {
    outDir: output,
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
await writeFile(resolve(output, ".nojekyll"), "");

// Also provide one HTML file that can be opened directly or uploaded on its own.
let html = await readFile(resolve(output, "index.html"), "utf8");
const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const stylesheet = html.match(
  /<link\b[^>]*rel="stylesheet"[^>]*href="(\.\/assets\/[^\"]+)"[^>]*>/,
);
if (!script || !stylesheet)
  throw new Error("The built HTML is missing its JS or CSS bundle.");
const js = await readFile(resolve(output, script[1]), "utf8");
// Live Server inserts its reload script before the first literal </body>,
// including one inside a JavaScript template used to export a poster.
// A data module preserves the bundle bytes without exposing template markup
// to HTML scanners, while keeping this edition a single offline-capable file.
const moduleSource = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const css = await readFile(resolve(output, stylesheet[1]), "utf8");
const assets = {};
async function embedDocuments(folder, prefix = "/document-assets") {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name);
    if (entry.isDirectory())
      await embedDocuments(path, `${prefix}/${entry.name}`);
    else {
      const type = entry.name.endsWith(".js")
        ? "text/javascript"
        : entry.name.endsWith(".wasm")
          ? "application/wasm"
          : "application/octet-stream";
      assets[`${prefix}/${entry.name}`] =
        `data:${type};base64,${(await readFile(path)).toString("base64")}`;
    }
  }
}
await embedDocuments(resolve(output, "document-assets"));
for (const filename of await readdir(resolve(output, "art"))) {
  const type = { ".webp": "image/webp", ".svg": "image/svg+xml" }[
    extname(filename)
  ];
  if (!type) continue;
  const data = await readFile(resolve(output, "art", filename));
  assets[`/art/${filename}`] = `data:${type};base64,${data.toString("base64")}`;
}
const favicon = await readFile(resolve(output, "favicon.svg"));
html = html
  .replace(
    script[0],
    () =>
      `<script>globalThis.__LITVERSE_ASSETS__=${JSON.stringify(assets)};</script>\n<script type="module" src="${moduleSource}"></script>`,
  )
  .replace(
    stylesheet[0],
    () => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
  )
  .replace(
    /href="\.\/favicon\.svg"/,
    `href="data:image/svg+xml;base64,${favicon.toString("base64")}"`,
  );
await mkdir(release, { recursive: true });
await writeFile(resolve(release, "index.html"), html);
await writeFile(resolve(release, ".nojekyll"), "");
console.log("GitHub Pages folder: github-pages/");
console.log(
  `Standalone HTML: release/index.html (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`,
);
