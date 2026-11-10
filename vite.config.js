import { defineConfig } from "vite";
import { documentAssets } from "./scripts/document-assets.mjs";
export default defineConfig({
  plugins: [documentAssets()],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/release/**", "**/github-pages/**", "**/test-results/**"],
    },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 650 },
});
