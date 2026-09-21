import { describe, expect, it } from "vitest";
import { parseNumber, rupeesToPaise } from "./parse";

describe("rupeesToPaise — exact, from the digits", () => {
  it.each([
    ["6500", 650_000],
    ["6,500.50", 650_050],
    ["₹ 6,500", 650_000],
    ["0.1", 10],
    ["0.07", 7],
    ["19.99", 1_999], // 19.99 * 100 is 1998.9999999999998 in floating point
    ["1.10", 110],
    [".5", 50],
    ["0", 0],
    ["4500.00", 450_000],
    ["12,34,567.50", 123_456_750], // Indian grouping
    ["1,234,567", 123_456_700], // western grouping
    ["90071992547409.91", 9_007_199_254_740_991], // the largest exactly-representable amount
  ])("%s → %s paise", (text, paise) => {
    expect(rupeesToPaise(text)).toBe(paise);
  });

  it.each(["", " ", ".", "1.005", "1.", "abc", "-5", "1e3", "1.2.3", "12,5x", "9007199254740993", "90071992547409.92", "1,5", "65,0.0.0", "1,2345", "12,34"])("refuses %j", (text) => {
    expect(rupeesToPaise(text)).toBeUndefined();
  });
});

describe("parseNumber", () => {
  it("reads plain and grouped numbers within the allowed decimals", () => {
    expect(parseNumber("25", 3)).toBe(25);
    expect(parseNumber("1,250.5", 3)).toBe(1250.5);
    expect(parseNumber("0.150", 3)).toBe(0.15);
    expect(parseNumber(".5", 3)).toBe(0.5);
    expect(parseNumber("12.5", 6)).toBe(12.5);
    expect(parseNumber("7", 0)).toBe(7);
    expect(parseNumber("12,34,567.5", 3)).toBe(1_234_567.5);
  });

  it("does not read a decimal comma as a thousands separator (1,5 is not 15)", () => {
    expect(parseNumber("1,5", 6)).toBeUndefined();
    expect(parseNumber("0,15", 3)).toBeUndefined();
  });

  it.each([["12.3456", 3], ["1.5", 0], ["", 3], [".", 3], ["-1", 3], ["1e3", 3], ["abc", 3], ["1.2.3", 3]] as const)("refuses %j with %i decimals allowed", (text, places) => {
    expect(parseNumber(text, places)).toBeUndefined();
  });
});
