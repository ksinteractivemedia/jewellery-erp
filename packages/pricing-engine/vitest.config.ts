import { defineConfig } from "vitest/config";

// No database, no network, no setup files — the engine is pure, and its tests must stay that way.
export default defineConfig({ test: { environment: "node", include: ["src/**/*.test.ts"] } });
