import { describe, expect, it } from "vitest";
import { clearFilters, hasActiveFilters, parseListingParams, toApiQuery, toSearchString } from "./listing-params";
import { formatGrams, formatMoney, rupeesToPaise } from "./money";

describe("parseListingParams — the URL is untrusted", () => {
  it("defaults a plain URL", () => {
    expect(parseListingParams({})).toEqual({ sort: "newest", inStock: false, page: 1 });
  });
  it("reads a full URL, prices in rupees", () => {
    expect(parseListingParams({ sort: "price-asc", metal: "gold", purity: "22K", category: "rings", min: "25000", max: "1,00,000", inStock: "1", page: "3" })).toEqual({
      sort: "price-asc", metal: "GOLD", purity: "22K", category: "rings", minRupees: 25000, maxRupees: 100000, inStock: true, page: 3,
    });
  });
  it("swaps a reversed price range instead of returning nothing", () => {
    expect(parseListingParams({ min: "9000", max: "1000" })).toMatchObject({ minRupees: 1000, maxRupees: 9000 });
  });
  it.each([
    ["an unknown sort", { sort: "cheapest" }],
    ["a script in a filter", { metal: "<script>", purity: "a/b", category: "Not A Slug" }],
    ["junk prices", { min: "abc", max: "-5" }],
    ["a bad page", { page: "0" }],
    ["a huge page", { page: "999999" }],
    ["a fractional page", { page: "2.5" }],
  ])("falls back for %s", (_n, raw) => {
    expect(parseListingParams(raw)).toEqual({ sort: "newest", inStock: false, page: 1 });
  });
  it("takes the first of a repeated parameter", () => {
    expect(parseListingParams({ metal: ["gold", "silver"] }).metal).toBe("GOLD");
  });
});

describe("toSearchString / toApiQuery", () => {
  it("leaves defaults out of the address bar", () => {
    expect(toSearchString({ sort: "newest", inStock: false, page: 1 })).toBe("");
    expect(toSearchString({ sort: "price-desc", metal: "GOLD", minRupees: 500, inStock: true, page: 2 })).toBe("?sort=price-desc&metal=GOLD&min=500&inStock=1&page=2");
  });
  it("round-trips", () => {
    const p = parseListingParams({ sort: "bestselling", purity: "18K", min: "1000", page: "4" });
    expect(parseListingParams(Object.fromEntries(new URLSearchParams(toSearchString(p))))).toEqual(p);
  });
  it("sends the API paise, and keeps the page's own scope", () => {
    const q = new URLSearchParams(toApiQuery({ collection: "bridal-edit", q: "ring" }, parseListingParams({ min: "1000", max: "2000", inStock: "1", metal: "gold" })));
    expect(Object.fromEntries(q)).toMatchObject({ collection: "bridal-edit", q: "ring", minPrice: "100000", maxPrice: "200000", inStock: "true", metal: "GOLD", sort: "newest", page: "1", pageSize: "24" });
  });
  it("lets a chosen sub-category narrow the page's category", () => {
    expect(new URLSearchParams(toApiQuery({ category: "necklaces" }, parseListingParams({ category: "chokers" }))).get("category")).toBe("chokers");
  });
  it("knows when filters are on, and clears them but keeps the sort", () => {
    expect(hasActiveFilters(parseListingParams({ sort: "price-asc" }))).toBe(false);
    const p = parseListingParams({ sort: "price-asc", metal: "gold", page: "2" });
    expect(hasActiveFilters(p)).toBe(true);
    expect(clearFilters(p)).toEqual({ sort: "price-asc", inStock: false, page: 1 });
  });
});

describe("money", () => {
  it("formats paise as Indian rupees", () => {
    expect(formatMoney(7_632_300)).toBe("₹76,323");
    expect(formatMoney(12_345_678)).toBe("₹1,23,457");
    expect(formatMoney(5_050, { precise: true })).toBe("₹50.50");
  });
  it("formats weights without trailing zeros", () => {
    expect(formatGrams(10)).toBe("10 g");
    expect(formatGrams(3.9)).toBe("3.9 g");
    expect(formatGrams(4.032)).toBe("4.032 g");
  });
  it("reads whole rupees only, exactly", () => {
    expect(rupeesToPaise("25,000")).toBe(2_500_000);
    for (const bad of ["", undefined, "1.5", "-4", "abc", "1234567890"]) expect(rupeesToPaise(bad)).toBeUndefined();
  });
});
