import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works from a GitHub Pages sub-path.
  base: "./",
  build: { chunkSizeWarningLimit: 1600 },
});
