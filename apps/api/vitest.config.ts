import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    // DB-backed tests share one in-memory replica set (test/setup.ts) — run them
    // sequentially so `mongoose.connection.dropDatabase()` between tests can't race.
    fileParallelism: false,
  },
});
