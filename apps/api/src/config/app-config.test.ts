import { describe, expect, it } from "vitest";
import { loadConfig } from "./app-config";

const base = { JWT_ACCESS_SECRET: "a".repeat(32) };

describe("loadConfig", () => {
  it("defaults to localhost URLs outside production, without complaint", () => {
    const config = loadConfig({ ...base, NODE_ENV: "development" });
    expect(config.auth.appBaseUrl).toBe("http://localhost:3000");
    expect(config.checkout.storeBaseUrl).toBe("http://localhost:3001");
  });

  it("refuses to boot in production with a localhost APP_BASE_URL, STORE_BASE_URL or API_PUBLIC_URL — those links go to real people", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production", ALLOWED_ORIGINS: "https://erp.example.com", APP_BASE_URL: "https://erp.example.com", STORE_BASE_URL: "https://shop.example.com", API_PUBLIC_URL: "https://api.example.com" })).not.toThrow();
    expect(() => loadConfig({ ...base, NODE_ENV: "production", STORE_BASE_URL: "https://shop.example.com", API_PUBLIC_URL: "https://api.example.com" })).toThrow(/APP_BASE_URL/);
    expect(() => loadConfig({ ...base, NODE_ENV: "production", APP_BASE_URL: "https://erp.example.com", API_PUBLIC_URL: "https://api.example.com" })).toThrow(/STORE_BASE_URL/);
    expect(() => loadConfig({ ...base, NODE_ENV: "production", APP_BASE_URL: "https://erp.example.com", STORE_BASE_URL: "https://shop.example.com" })).toThrow(/API_PUBLIC_URL/);
  });
});
