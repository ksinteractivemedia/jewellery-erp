import { describe, expect, it } from "vitest";
import { addLine, cartCount, lineKey, parseCart, removeLine, setLineQuantity } from "./cart";
import { createPersistentStore, type StorageLike } from "./persistent-store";
import { parseWishlist, toggleSlug } from "./wishlist";

const memory = (initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => ({ data: { ...initial }, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } });

describe("the bag holds choices, never prices", () => {
  it("adds a line, merges a repeat of the same piece and size, and keeps different sizes apart", () => {
    let lines = addLine([], { slug: "ring" });
    lines = addLine(lines, { slug: "ring" });
    lines = addLine(lines, { slug: "ring", variantSku: "R-14" });
    expect(lines).toEqual([{ slug: "ring", quantity: 2 }, { slug: "ring", variantSku: "R-14", quantity: 1 }]);
    expect(cartCount(lines)).toBe(3);
  });
  it("caps a line at the most the API allows", () => {
    expect(addLine([{ slug: "a", quantity: 9 }], { slug: "a", quantity: 5 })[0]!.quantity).toBe(10);
    expect(setLineQuantity([{ slug: "a", quantity: 1 }], lineKey({ slug: "a" }), 99)[0]!.quantity).toBe(10);
  });
  it("removes a line when its quantity drops below one, or on request", () => {
    const lines = [{ slug: "a", quantity: 1 }, { slug: "b", quantity: 2 }];
    expect(setLineQuantity(lines, lineKey({ slug: "a" }), 0)).toEqual([{ slug: "b", quantity: 2 }]);
    expect(removeLine(lines, lineKey({ slug: "b" }))).toEqual([{ slug: "a", quantity: 1 }]);
  });
  it("never stores a price field, whatever it is handed", () => {
    expect(parseCart([{ slug: "a", quantity: 2, price: 1, total: 5, unitPrice: { total: 1 } }])).toEqual([{ slug: "a", quantity: 2 }]);
  });
  it("repairs what it reads back: bad slugs, duplicates, wild quantities, non-arrays", () => {
    expect(parseCart("nope")).toEqual([]);
    expect(parseCart([{ slug: "Bad Slug", quantity: 1 }, { slug: "a", quantity: 500 }, { slug: "a", quantity: 1 }, null, { slug: "b", quantity: 1.5 }])).toEqual([{ slug: "a", quantity: 10 }, { slug: "b", quantity: 1 }]);
  });
  it("holds at most 30 lines", () => {
    expect(parseCart(Array.from({ length: 50 }, (_, i) => ({ slug: `item-${i}`, quantity: 1 })))).toHaveLength(30);
  });
});

describe("wishlist", () => {
  it("toggles a design in and out, newest first", () => {
    expect(toggleSlug(["a"], "b")).toEqual(["b", "a"]);
    expect(toggleSlug(["b", "a"], "b")).toEqual(["a"]);
  });
  it("de-duplicates and drops junk when read back", () => {
    expect(parseWishlist(["a", "a", "B c", 5, "b"])).toEqual(["a", "b"]);
    expect(parseWishlist({})).toEqual([]);
  });
});

describe("createPersistentStore", () => {
  const make = (storage: StorageLike | null) => createPersistentStore<string[]>({ key: "k", empty: [], parse: parseWishlist, storage });
  it("saves, and a fresh store reads it back (a reload)", () => {
    const storage = memory();
    make(storage).set(["a", "b"]);
    expect(make(storage).get()).toEqual(["a", "b"]);
  });
  it("notifies subscribers, and stops when they unsubscribe", () => {
    const store = make(memory());
    let calls = 0;
    const off = store.subscribe(() => calls++);
    store.set(["a"]);
    off();
    store.set(["b"]);
    expect(calls).toBe(1);
  });
  it("starts clean from corrupt storage instead of crashing", () => {
    expect(make(memory({ k: "{not json" })).get()).toEqual([]);
  });
  it("works in memory when storage is unavailable or throws", () => {
    const store = make(null);
    store.set(["a"]);
    expect(store.get()).toEqual(["a"]);
    const angry: StorageLike = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } };
    const s2 = make(angry);
    expect(() => s2.set(["z"])).not.toThrow();
    expect(s2.get()).toEqual(["z"]);
  });
  it("shows the server (and the first client render) the empty value, so hydration matches", () => {
    const store = make(memory({ k: JSON.stringify(["saved"]) }));
    expect(store.getServer()).toEqual([]);
    expect(store.get()).toEqual(["saved"]);
  });
});
