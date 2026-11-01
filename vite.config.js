import { defineConfig } from "vite";
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/release/**", "**/github-pages/**", "**/test-results/**"],
    },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 650 },
});
