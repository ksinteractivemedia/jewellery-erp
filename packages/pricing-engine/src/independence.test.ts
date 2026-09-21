import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The engine's independence is a rule (CLAUDE.md #1, architecture.md §5), so it is enforced here rather than
 * trusted: production sources may import only sibling files and TYPES from @jewellery/types, and may not
 * read a clock or a random source — that is what keeps a price reproducible from its inputs alone.
 */
const dir = join(__dirname);
const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "fixtures.ts" && f !== "oracle-cases.ts");

describe("pricing-engine stays a pure, dependency-free domain package", () => {
  it("finds the production sources", () => {
    expect(sources.length).toBeGreaterThan(8);
  });

  it.each(sources)("%s imports only siblings and types", (file) => {
    const text = readFileSync(join(dir, file), "utf8");
    const specifiers = [...text.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gms)].map((m) => m[1]!);
    for (const spec of specifiers) {
      expect(spec.startsWith("./") || spec === "@jewellery/types", `${file} imports "${spec}"`).toBe(true);
    }
    // Anything from @jewellery/types must be a type-only import, so nothing of it exists at runtime.
    for (const m of text.matchAll(/^\s*import\b([^;]*?)\bfrom\s+["']@jewellery\/types["']/gms)) {
      expect(m[0], `${file}: import from @jewellery/types must be "import type"`).toMatch(/^\s*import type\b/);
    }
  });

  it.each(sources)("%s reads no clock, randomness, environment or I/O", (file) => {
    const code = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const banned of [/\bDate\.now\b/, /\bnew Date\(\s*\)/, /\bMath\.random\b/, /\bprocess\./, /\bfetch\(/, /\brequire\(/, /\bperformance\.now\b/]) {
      expect(code, `${file} uses ${banned}`).not.toMatch(banned);
    }
  });

  it("declares @jewellery/types as its only runtime-visible dependency", () => {
    const pkg = JSON.parse(readFileSync(join(dir, "..", "package.json"), "utf8"));
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(["@jewellery/types"]);
  });
});
