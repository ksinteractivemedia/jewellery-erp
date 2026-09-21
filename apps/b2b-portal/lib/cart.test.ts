import { describe, expect, it } from "vitest";
import { addToCart, cartPieces, parseCart, setQuantity } from "./cart";
import { mergeRows, parsePaste, readyRows, newRow } from "./quick-order";
import { orderSteps } from "./status";
import { date, money, rupeesToPaise } from "./money";

describe("cart", () => {
  it("holds SKUs and quantities only, merging repeats and upper-casing", () => {
    let c = addToCart([], { sku: "band-1", quantity: 2 });
    c = addToCart(c, { sku: "BAND-1", quantity: 3 });
    c = addToCart(c, { sku: "RING-1-12", quantity: 1 });
    expect(c).toEqual([{ sku: "BAND-1", quantity: 5 }, { sku: "RING-1-12", quantity: 1 }]);
    expect(cartPieces(c)).toBe(6);
  });
  it("changes and removes lines", () => {
    const c = [{ sku: "A", quantity: 2 }];
    expect(setQuantity(c, "A", 5)).toEqual([{ sku: "A", quantity: 5 }]);
    expect(setQuantity(c, "A", 0)).toEqual([]);
  });
  it("survives a corrupt saved cart, and never keeps a price", () => {
    expect(parseCart("nonsense")).toEqual([]);
    expect(parseCart([{ sku: "a", quantity: 2, price: 999 }, { sku: "", quantity: 1 }, { sku: "b", quantity: -3 }, { sku: "a", quantity: 9 }])).toEqual([{ sku: "A", quantity: 2 }]);
  });
});

describe("quick order rows", () => {
  it("parses pasted lines in the common shapes, ignoring headers and junk", () => {
    const { rows, ignored } = parsePaste("SKU,Qty\nband-1, 4\nring-1-12\t2\nGLD-EAR-0001 6\n\n???\nchain-9");
    expect(rows.map((r) => [r.sku, r.quantity])).toEqual([["BAND-1", "4"], ["RING-1-12", "2"], ["GLD-EAR-0001", "6"], ["CHAIN-9", "1"]]);
    expect(ignored).toEqual(["???"]);
  });
  it("asks the server only about complete rows", () => {
    expect(readyRows([newRow("A", "2"), newRow("B", ""), newRow("", "3"), newRow("C", "1.5"), newRow("D", "0")])).toEqual([{ sku: "A", quantity: 2 }]);
  });
  it("merges repeated SKUs", () => {
    expect(mergeRows([{ sku: "a", quantity: 1 }, { sku: "A", quantity: 2 }])).toEqual([{ sku: "A", quantity: 3 }]);
  });
});

describe("money", () => {
  it("formats paise in Indian grouping, and reads rupees back exactly", () => {
    expect(money(736_450_000)).toBe("₹73,64,500.00");
    expect(rupeesToPaise("1,50,000.50")).toBe(15_000_050);
    expect(rupeesToPaise("12.345")).toBeUndefined();
    expect(rupeesToPaise("abc")).toBeUndefined();
    expect(date("2026-09-21")).toMatch(/^21 Sep/);
  });
});

describe("order steps", () => {
  it("shows an order moving from review to paid, with a quotation step only when there was one", () => {
    expect(orderSteps({ po: { status: "SUBMITTED" }, quoted: false }).map((s) => [s.label, s.state])).toEqual([["Purchase order", "done"], ["Seller review", "current"], ["Stock allocated", "todo"], ["Invoiced", "todo"], ["Paid", "todo"]]);
    const s = orderSteps({ quoted: true, order: { status: "INVOICED" }, invoice: { status: "PARTIALLY_PAID" } });
    expect(s.map((x) => x.label)).toContain("Quotation");
    expect(s.find((x) => x.label === "Invoiced")!.state).toBe("done");
    expect(s.find((x) => x.label === "Paid")!.state).toBe("current");
  });
  it("marks a credit hold as blocked, with what it is waiting for", () => {
    const s = orderSteps({ quoted: false, order: { status: "PENDING_CREDIT_APPROVAL" } });
    expect(s.find((x) => x.label === "Credit approval")).toMatchObject({ state: "blocked", note: "Waiting for our credit team" });
  });
});
