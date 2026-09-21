import { defineConfig } from "vitest/config";

// Pure logic only: money formatting, quick-order parsing, statuses and the local cart.
export default defineConfig({ test: { environment: "node", include: ["lib/**/*.test.ts"] } });
