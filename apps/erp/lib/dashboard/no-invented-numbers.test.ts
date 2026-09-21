import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The dashboard must not invent numbers. Every figure comes from the API; a component that drew a random value,
 * or wrote a rupee amount or a count into its markup, would be a made-up metric. This reads the dashboard's source
 * and refuses both.
 */
const ROOT = join(__dirname, "..", "..");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !n.endsWith(".test.ts") ? [p] : []; });
const files = [...walk(join(ROOT, "components", "dashboard")), ...walk(join(ROOT, "lib", "dashboard")), join(ROOT, "lib", "api", "dashboard.ts"), join(ROOT, "lib", "api", "dashboard-queries.ts")];
const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("the dashboard invents no numbers", () => {
  it("finds the dashboard sources", () => {
    expect(files.length).toBeGreaterThan(14);
  });

  it("draws nothing at random", () => {
    expect(files.filter((f) => /\bMath\.random\b|\bfaker\b|crypto\.getRandomValues/.test(code(f))).map((f) => relative(ROOT, f))).toEqual([]);
  });

  it("writes no rupee amount into its markup or logic", () => {
    // "₹" followed by a digit anywhere in code (not in comments) would be a hard-coded figure; formatting goes through formatCurrency.
    expect(files.filter((f) => /₹\s?\d/.test(code(f))).map((f) => relative(ROOT, f))).toEqual([]);
  });

  it("imports no sample or seed data", () => {
    expect(files.filter((f) => /dev-adapters|\/seed\/|sample-data|SAMPLE_/.test(code(f).replace(/["']SAMPLE["']/g, ""))).map((f) => relative(ROOT, f))).toEqual([]);
  });

  it("does not compute prices or margins itself: no cost/revenue arithmetic in components", () => {
    const offenders = walk(join(ROOT, "components", "dashboard")).filter((f) => /\.(revenue|cost|margin|outstanding|overdue|amount|todayRevenue|grossMargin)\s*[-*/+]\s*[\w.(]/.test(code(f)));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});
