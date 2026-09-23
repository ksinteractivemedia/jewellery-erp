import { Types } from "mongoose";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { Exchange } from "@jewellery/types";
import { buildTestApp, createStaff, loginAs, seedRbac, bearer } from "../../test/helpers";
import { type World, makeWorld } from "../../test/inventory-fixtures";
import { AuditLogModel } from "../modules/audit/audit-log.model";
import { InventoryItemModel } from "../modules/inventory/inventory-item.model";
import { InventoryLedgerModel } from "../modules/inventory/inventory-ledger.model";

let t: ReturnType<typeof buildTestApp>;
let w: World;
const tokens: Record<string, string> = {};

const staff = (path: string, who = "manager") => request(t.app).get(`/api/exchange${path}`).set(bearer(tokens[who]!));
const staffPost = (path: string, body: object = {}, who = "manager") => request(t.app).post(`/api/exchange${path}`).set(bearer(tokens[who]!)).send(body);

async function tokenFor(email: string) {
  const { accessToken, res } = await loginAs(t.app, email);
  if (!accessToken) throw new Error(`sign-in failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return accessToken;
}

const oldJewellery = (over: Record<string, unknown> = {}) => ({
  description: "Old gold bangle, worn",
  metalId: undefined as unknown as string, // filled in per-test with w.gold
  grossWeight: 20,
  stoneWeight: 2,
  assessedPurity: "22K",
  ratePerGram: 650000, // paise per gram
  deduction: 0,
  ...over,
});

beforeEach(async () => {
  t = buildTestApp();
  await seedRbac();
  w = await makeWorld();
  tokens.manager = await tokenFor((await createStaff("STORE_MANAGER")).email);
  tokens.exec = await tokenFor((await createStaff("SALES_EXECUTIVE")).email);
  tokens.viewer = await tokenFor((await createStaff("VIEWER")).email);
});

describe("who can reach what", () => {
  it("needs a login", async () => {
    expect((await request(t.app).get("/api/exchange/dashboard")).status).toBe(401);
  });
  it("view is open to exchange.view; a viewer cannot write", async () => {
    expect((await staff("/dashboard", "viewer")).status).toBe(200);
    expect((await staffPost("/", { customer: { name: "x" } }, "viewer")).status).toBe(403);
  });
});

describe("valuation is computed server-side, from the one shared metal-value formula", () => {
  it("never accepts a hand-entered valuation, netWeight or fineWeight", async () => {
    const res = await staffPost("/", { customer: { name: "Ravi Shah", phone: "9000000001" }, oldJewellery: oldJewellery({ metalId: w.gold, valuation: 999999 }) });
    expect(res.status).toBe(400);
  });

  it("computes netWeight, fineWeight and valuation from the assessed purity's fineness and the given rate", async () => {
    const res = await staffPost("/", { customer: { name: "Ravi Shah", phone: "9000000001" }, oldJewellery: oldJewellery({ metalId: w.gold }) });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const ex: Exchange = res.body.exchange;
    expect(ex.exchangeNo).toMatch(/^EXC-\d{6}$/);
    expect(ex.status).toBe("ASSESSED");
    // net = 20 - 2 = 18g; the rate is quoted for this exact assessed purity, so valuation = netWeight x ratePerGram directly (business-rules.md §1.8)
    expect(ex.oldJewellery.netWeight).toBeCloseTo(18, 3);
    expect(ex.oldJewellery.fineWeight).toBeCloseTo(16.488, 3); // informational only — not part of the valuation math here
    expect(ex.oldJewellery.valuation).toBe(18 * 650000);
  });

  it("a deduction reduces the valuation, never below zero", async () => {
    const res = await staffPost("/", { customer: { name: "Ravi Shah", phone: "9000000001" }, oldJewellery: oldJewellery({ metalId: w.gold, deduction: 18 * 650000 + 500000 }) });
    expect(res.body.exchange.oldJewellery.valuation).toBe(0);
  });

  it("refuses an unrecognised purity for the metal", async () => {
    const res = await staffPost("/", { customer: { name: "Ravi Shah", phone: "9000000001" }, oldJewellery: oldJewellery({ metalId: w.gold, assessedPurity: "999K" }) });
    expect(res.status).toBe(400);
  });
});

describe("the full flow: old jewellery -> assessment -> new product -> difference, with a real EXCHANGE_IN ledger entry", () => {
  it("taking the old piece in creates a real, ledgered InventoryItem; a positive difference means the customer owes us", async () => {
    const created = await staffPost("/", { customer: { name: "Ravi Shah", phone: "9000000001" }, oldJewellery: oldJewellery({ metalId: w.gold }) });
    const ex: Exchange = created.body.exchange;
    expect(ex.oldItemId).toBeUndefined(); // nothing taken in yet

    const completed = await staffPost(`/${ex.id}/complete`, {
      locationId: w.loc.counter,
      newProduct: { productId: new Types.ObjectId().toString(), sku: "RG-777", name: "Diamond Ring", quantity: 1, unitPrice: 15000000, lineTotal: 15000000 },
      settlement: { method: "CARD", reference: "CARD-9001" },
    });
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    const done: Exchange = completed.body.exchange;
    expect(done.status).toBe("COMPLETED");
    expect(done.oldItemId).toBeTruthy();
    expect(done.settlement).toMatchObject({ difference: 15000000 - 18 * 650000, method: "CARD" }); // customer owes the difference

    const oldItem = await InventoryItemModel.findById(done.oldItemId).lean();
    expect(oldItem).toMatchObject({ type: "RAW_MATERIAL", status: "AVAILABLE", grossWeight: 20, stoneWeight: 2, cost: 18 * 650000 });
    expect(String(oldItem!.locationId)).toBe(w.loc.counter);
    const ledger = await InventoryLedgerModel.find({ itemId: done.oldItemId }).lean();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ movementType: "EXCHANGE_IN", toStatus: "AVAILABLE" });
    const log = await AuditLogModel.findOne({ action: "exchange.completed" }).lean();
    expect(log!.metadata).toMatchObject({ exchangeNo: ex.exchangeNo, newSku: "RG-777" });
  });

  it("a negative difference means the business owes the customer — never clamped away", async () => {
    const created = await staffPost("/", { customer: { name: "Meera", phone: "9000000002" }, oldJewellery: oldJewellery({ metalId: w.gold }) }); // valuation = 18 * 650000
    const ex: Exchange = created.body.exchange;
    const completed = await staffPost(`/${ex.id}/complete`, {
      locationId: w.loc.counter,
      newProduct: { productId: new Types.ObjectId().toString(), sku: "ST-001", name: "Small stud", quantity: 1, unitPrice: 500000, lineTotal: 500000 },
      settlement: { method: "STORE_CREDIT" },
    });
    expect(completed.body.exchange.settlement.difference).toBe(500000 - 18 * 650000);
    expect(completed.body.exchange.settlement.difference).toBeLessThan(0);
  });

  it("can be re-assessed before completion, and cancelled before the piece is taken in", async () => {
    const created = await staffPost("/", { customer: { name: "Kiran", phone: "9000000003" }, oldJewellery: oldJewellery({ metalId: w.gold }) });
    const ex: Exchange = created.body.exchange;
    const reassessed = await staffPost(`/${ex.id}/assess`, { oldJewellery: oldJewellery({ metalId: w.gold, grossWeight: 25 }) });
    expect(reassessed.status, JSON.stringify(reassessed.body)).toBe(200);
    expect(reassessed.body.exchange.oldJewellery.grossWeight).toBe(25);

    const cancelled = await staffPost(`/${ex.id}/cancel`, { reason: "Customer changed their mind" });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(cancelled.body.exchange.status).toBe("CANCELLED");
    expect((await staffPost(`/${ex.id}/complete`, { locationId: w.loc.counter, newProduct: { productId: new Types.ObjectId().toString(), sku: "X", name: "X", unitPrice: 1, lineTotal: 1 }, settlement: {} })).status).toBe(409);
  });
});
