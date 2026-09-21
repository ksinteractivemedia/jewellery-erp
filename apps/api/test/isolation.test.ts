import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Mock data stays isolated (CLAUDE.md rule 7), and the dashboard shows no invented numbers. Both are enforced
 * structurally: production code under src/ may not import seed data or a development adapter, and nothing that
 * produces sample data may reach for a random source — the sample facts are arithmetic patterns, the same on every run.
 */
const ROOT = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules") return [];
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
  });
const production = walk(join(ROOT, "src")).filter((f) => !f.endsWith(".test.ts"));
const sampleProducers = [...walk(join(ROOT, "seed")), ...walk(join(ROOT, "dev-adapters"))].filter((f) => !f.endsWith(".test.ts"));
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("mock data isolation", () => {
  it("finds the sources it is meant to police", () => {
    expect(production.length).toBeGreaterThan(50);
    expect(sampleProducers.map((f) => relative(ROOT, f))).toContain("dev-adapters/dashboard-sample.ts");
  });

  it("no production file imports seed data or a development adapter", () => {
    const offenders = production.filter((f) => /from\s+["'][^"']*(\/seed\/|\/seed"|dev-adapters)[^"']*["']/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it("nothing that could show a number draws one at random (token generation in auth is the only legitimate randomness)", () => {
    const offenders = [...production, ...sampleProducers].filter((f) => /\bMath\.random\b|\bcrypto\.random(Int|Bytes|UUID)\b/.test(strip(readFileSync(f, "utf8"))) && !f.includes("/auth/") && !f.includes("/shared/counters"));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it("the dashboard module never contains sample facts of its own", () => {
    const dashboard = production.filter((f) => f.includes("/modules/dashboard/"));
    expect(dashboard.length).toBeGreaterThan(8);
    for (const file of dashboard) expect(strip(readFileSync(file, "utf8")), relative(ROOT, file)).not.toMatch(/sample-|SAMPLE_FACTS|faker/i);
  });
});
