import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The level checks run a full search per sausage, which takes seconds.
    testTimeout: 60_000,
  },
});
