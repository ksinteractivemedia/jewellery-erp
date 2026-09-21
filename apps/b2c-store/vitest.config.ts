import { defineConfig } from "vitest/config";

// Pure logic only (money formatting, URL params, the local cart and wishlist stores, SEO builders).
export default defineConfig({ test: { environment: "node", include: ["lib/**/*.test.ts"] } });
