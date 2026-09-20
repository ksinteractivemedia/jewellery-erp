import { describe, expect, it } from "vitest";
import {
  createInventoryItemSchema,
  createTransferSchema,
  inventoryListQuerySchema,
  itemQrPayload,
  parseScanCode,
  partnerMovementSchema,
  postInventoryTransactionSchema,
  requestAdjustmentSchema,
  reserveItemsSchema,
  stockSummaryQuerySchema,
} from "@jewellery/validation";

const id = "64b0c0ffee0000000000aaaa";
const id2 = "64b0c0ffee0000000000bbbb";
const base = { type: "FINISHED_JEWELLERY", grossWeight: 10, metalId: id, purity: "22K", locationId: id, cost: 1000 };

describe("item weights", () => {
  it.each([
    ["zero gross", { grossWeight: 0 }],
    ["negative gross", { grossWeight: -1 }],
    ["NaN gross", { grossWeight: NaN }],
    ["infinite gross", { grossWeight: Infinity }],
    ["four decimal places", { grossWeight: 10.1234 }],
    ["absurd weight", { grossWeight: 5_000_000 }],
    ["negative stone weight", { stoneWeight: -0.5 }],
    ["stone above gross", { stoneWeight: 11 }],
    ["stone equal to gross on a metal item (zero net)", { stoneWeight: 10 }],
  ])("rejects %s", (_name, over) => {
    expect(createInventoryItemSchema.safeParse({ ...base, ...over }).success).toBe(false);
  });

  it("accepts a 3-decimal scale weight and stone weight below gross", () => {
    expect(createInventoryItemSchema.safeParse({ ...base, grossWeight: 18.423, stoneWeight: 0.5 }).success).toBe(true);
  });

  it("allows a loose stone whose whole weight is stone", () => {
    expect(createInventoryItemSchema.safeParse({ ...base, type: "LOOSE_STONE", stoneWeight: 10 }).success).toBe(true);
  });
});

describe("HUID", () => {
  it("normalises to uppercase and requires exactly six letters/digits", () => {
    expect(createInventoryItemSchema.parse({ ...base, huid: "ab12cd" }).huid).toBe("AB12CD");
    for (const bad of ["AB12C", "AB12CDE", "AB 2CD", "AB-2CD", "ÄB12CD", ""]) expect(createInventoryItemSchema.safeParse({ ...base, huid: bad }).success, bad).toBe(false);
  });

  it("a HUID implies hallmarked; an explicit contradiction is refused", () => {
    expect(createInventoryItemSchema.parse({ ...base, huid: "AB12CD" }).hallmarkStatus).toBe("HALLMARKED");
    expect(createInventoryItemSchema.parse(base).hallmarkStatus).toBe("NOT_APPLICABLE");
    expect(createInventoryItemSchema.safeParse({ ...base, huid: "AB12CD", hallmarkStatus: "NOT_APPLICABLE" }).success).toBe(false);
  });

  it("item code is optional (server allocates); barcodes reject whitespace and symbols", () => {
    expect(createInventoryItemSchema.safeParse(base).success).toBe(true);
    expect(createInventoryItemSchema.safeParse({ ...base, barcode: "8901 234" }).success).toBe(false);
    expect(createInventoryItemSchema.safeParse({ ...base, barcode: "<script>" }).success).toBe(false);
    expect(createInventoryItemSchema.safeParse({ ...base, barcode: "8901234-56" }).success).toBe(true);
  });
});

describe("posting contract", () => {
  const post = { type: "RESERVATION", channel: "ERP", referenceType: "ORDER", performedBy: id };
  it("refuses an item listed twice and more than 100 items", () => {
    expect(postInventoryTransactionSchema.safeParse({ ...post, lines: [{ itemId: id }, { itemId: id }] }).success).toBe(false);
    expect(postInventoryTransactionSchema.safeParse({ ...post, lines: Array.from({ length: 101 }, (_, i) => ({ itemId: `64b0c0ffee00000000${String(i).padStart(6, "0")}` })) }).success).toBe(false);
    expect(postInventoryTransactionSchema.safeParse({ ...post, lines: [] }).success).toBe(false);
  });
  it("refuses the removed/unknown movement names", () => {
    for (const t of ["GOODS_RECEIPT", "TRANSFER", "JOB_WORK_ISSUE", "PURCHASE", "DELETE"]) expect(postInventoryTransactionSchema.safeParse({ ...post, type: t, lines: [{ itemId: id }] }).success, t).toBe(false);
  });
  it("rejects a zero delta", () => {
    expect(postInventoryTransactionSchema.safeParse({ ...post, lines: [{ itemId: id, weightDelta: 0 }] }).success).toBe(false);
  });
});

describe("request schemas", () => {
  it("reservation needs an order id and caps hold length", () => {
    expect(reserveItemsSchema.safeParse({ itemIds: [id], referenceId: id }).success).toBe(true);
    expect(reserveItemsSchema.safeParse({ itemIds: [id] }).success).toBe(false);
    expect(reserveItemsSchema.safeParse({ itemIds: [id], referenceId: id, expiresInMinutes: 60 * 24 * 30 }).success).toBe(false);
    expect(reserveItemsSchema.safeParse({ itemIds: [id, id], referenceId: id }).success).toBe(false);
  });
  it("transfer needs two different locations", () => {
    expect(createTransferSchema.safeParse({ fromLocationId: id, toLocationId: id2, itemIds: [id] }).success).toBe(true);
    expect(createTransferSchema.safeParse({ fromLocationId: id, toLocationId: id, itemIds: [id] }).success).toBe(false);
  });
  it("partner movement takes only partner movement types", () => {
    expect(partnerMovementSchema.safeParse({ type: "HALLMARKING_OUT", itemIds: [id], destinationLocationId: id2 }).success).toBe(true);
    expect(partnerMovementSchema.safeParse({ type: "SALE", itemIds: [id], destinationLocationId: id2 }).success).toBe(false);
  });
  it("an adjustment needs a reason and at least one change", () => {
    expect(requestAdjustmentSchema.safeParse({ itemId: id, reason: "Found cracked at counter", toStatus: "DAMAGED" }).success).toBe(true);
    expect(requestAdjustmentSchema.safeParse({ itemId: id, reason: "ok" }).success).toBe(false);
    expect(requestAdjustmentSchema.safeParse({ itemId: id, reason: "Nothing to change here" }).success).toBe(false);
    expect(requestAdjustmentSchema.safeParse({ itemId: id, reason: "Reweighed on scale", grossWeight: 0 }).success).toBe(false);
    expect(requestAdjustmentSchema.safeParse({ itemId: id, reason: "Batch loss noted", weightDelta: 0 }).success).toBe(false);
  });
});

describe("list & summary queries", () => {
  it("parses csv statuses, coerces booleans and numbers, applies defaults", () => {
    const q = inventoryListQuerySchema.parse({ status: "AVAILABLE,RESERVED", availableForSale: "true", hasHuid: "false", page: "2", pageSize: "50" });
    expect(q).toMatchObject({ status: ["AVAILABLE", "RESERVED"], availableForSale: true, hasHuid: false, page: 2, pageSize: 50, sort: "updatedAt", order: "desc" });
  });
  it("rejects unknown statuses, sort fields, and oversized pages", () => {
    for (const bad of [{ status: "LOST" }, { sort: "passwordHash" }, { pageSize: "101" }, { availableForSale: "maybe" }, { locationId: "nope" }]) expect(inventoryListQuerySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
  it("summary requires a known grouping", () => {
    expect(stockSummaryQuerySchema.parse({ groupBy: "purity" })).toMatchObject({ groupBy: "purity", scope: "owned" });
    expect(stockSummaryQuerySchema.safeParse({ groupBy: "customer" }).success).toBe(false);
  });
});

describe("scan codes", () => {
  it("parses the QR payload, plain codes and a HUID-shaped code", () => {
    expect(parseScanCode("JERP:ITEM:JE-000123")).toMatchObject({ format: "QR_URI", value: "JE-000123", lookups: ["ITEM_CODE"] });
    expect(parseScanCode("jerp:item:je-000123")).toMatchObject({ value: "JE-000123" });
    expect(parseScanCode("8901234567890")).toMatchObject({ format: "PLAIN", lookups: ["ITEM_CODE", "BARCODE", "SERIAL_NUMBER"] });
    expect(parseScanCode("AB12CD")?.lookups).toContain("HUID");
    expect(parseScanCode("JE-000123")?.lookups).not.toContain("HUID");
  });
  it("strips the CR/LF/Tab a scanner appends, and control characters", () => {
    expect(parseScanCode("JE-000123\r\n")?.value).toBe("JE-000123");
    expect(parseScanCode("\tJE-000123\u0000")?.value).toBe("JE-000123");
  });
  it("rejects empty, oversized, and hostile input", () => {
    for (const bad of ["", "   ", "\r\n", "x".repeat(200), "JE 123", "<script>", "a;b", "JERP:ITEM:", "JERP:ITEM:bad code!", "../../etc/passwd$"]) expect(parseScanCode(bad), JSON.stringify(bad)).toBeNull();
  });
  it("round-trips the label payload", () => {
    expect(parseScanCode(itemQrPayload("je-000045"))).toMatchObject({ format: "QR_URI", value: "JE-000045" });
  });
});
