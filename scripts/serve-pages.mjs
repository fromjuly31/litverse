import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../github-pages/", import.meta.url));
const port = Number(process.env.LITVERSE_PREVIEW_PORT || 4174);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
await stat(resolve(root, "index.html")).catch(() => {
  throw new Error("Run npm run build:pages before starting the HTML preview.");
});
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(
      new URL(req.url, `http://127.0.0.1:${port}`).pathname,
    );
    // A second mount tests the same files under a GitHub project repository path.
    if (path === "/preview-repository") {
      res.writeHead(301, { Location: "/preview-repository/" }).end();
      return;
    }
    if (path.startsWith("/preview-repository/"))
      path = path.slice("/preview-repository".length);
    const target = resolve(
      root,
      `.${path.endsWith("/") ? `${path}index.html` : path}`,
    );
    const relativeRoot = resolve(root) + sep;
    if (!target.startsWith(relativeRoot)) {
      res.writeHead(403).end();
      return;
    }
    const file = await readFile(target);
    res.writeHead(200, {
      "Content-Type": mime[extname(target)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(file);
  } catch {
    // No SPA fallback: this behaves like a plain static file host.
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => {
  console.log(`HTML preview: http://127.0.0.1:${port}/`);
});
