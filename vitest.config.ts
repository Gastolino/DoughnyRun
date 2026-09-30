import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The level checks search every state a level allows, which takes seconds
    // to most of a minute per level.
    testTimeout: 60_000,
  },
});
