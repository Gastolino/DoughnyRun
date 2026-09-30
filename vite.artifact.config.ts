import { defineConfig } from "vite";

// Builds the game's own code as one script that expects Phaser as a global,
// for the single-page claude.ai artifact, which loads Phaser from a CDN.
export default defineConfig({
  build: {
    outDir: "dist-artifact",
    emptyOutDir: true,
    lib: {
      entry: "src/main.ts",
      formats: ["iife"],
      name: "DoughnyRun",
      fileName: () => "game.js",
    },
    rolldownOptions: {
      external: ["phaser"],
      output: { globals: { phaser: "Phaser" } },
    },
  },
});
