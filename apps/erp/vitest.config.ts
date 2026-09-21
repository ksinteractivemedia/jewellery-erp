import { defineConfig } from "vitest/config";

// Pure-logic tests only (parsing, request building). Components are exercised end to end in the browser, not here.
export default defineConfig({ test: { environment: "node", include: ["lib/**/*.test.ts"] } });
