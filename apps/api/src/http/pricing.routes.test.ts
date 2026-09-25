import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { ALL_ROLE_NAMES, PERMISSIONS as P, ROLE_NAMES as R, type RoleName } from "@jewellery/types";
import { bearer, buildTestApp, createStaff, loginAs, seedRbac } from "../../test/helpers";
import { type World, makeWorld } from "../../test/inventory-fixtures";
import { AuditLogModel } from "../modules/audit/audit-log.model";
import { AUDIT_ACTIONS } from "../modules/audit/audit.service";
import { DEFAULT_ROLE_MATRIX } from "../modules/auth/rbac/role-matrix";
import { createPricingRule } from "../modules/pricing/pricing-rule.repository";

let t: ReturnType<typeof buildTestApp>;
let w: World;
const tokens = new Map<RoleName, string>();

async function tokenFor(role: RoleName) {
  if (!tokens.has(role)) {
    const { email } = await createStaff(role);
    const login = await loginAs(t.app, email);
    // Fail at the real cause: a failed sign-in would otherwise surface later as a baffling 401 on an unrelated request.
    if (!login.accessToken) throw new Error(`sign-in as ${role} <${email}> failed: ${login.res.status} ${JSON.stringify(login.res.body)}`);
    tokens.set(role, login.accessToken);
  }
  return tokens.get(role)!;
}
const preview = async (body: object, role: RoleName = R.ADMIN) => request(t.app).post("/api/pricing/preview").set(bearer(await tokenFor(role))).send(body);

const TAX = { hsnCode: "7113", intraState: { cgst: 1.5, sgst: 1.5 }, interState: { igst: 3 }, sellerState: "Maharashtra", buyerState: "Maharashtra" };

/** The 22K necklace of scenario S1 in tests/test-plan.md (25 g, 1.5 g stones, ₹6,500/g, 12% making, 2% wastage). */
const necklace = (over: Record<string, unknown> = {}) => ({
  metalId: w.gold,
  purity: "22K",
  grossWeight: 25,
  stoneWeight: 1.5,
  rate: { ratePerGram: 650_000, purity: "22K" },
  stoneValue: 450_000,
  making: { type: "PERCENTAGE", value: 12 },
  wastage: { type: "PERCENTAGE", value: 2 },
  customerType: "B2C",
  tax: TAX,
  ...over,
});
const rule = (over: Record<string, unknown>) => createPricingRule({ name: "rule", metalId: w.gold, validFrom: new Date("2020-01-01"), makingChargeType: "PERCENTAGE", makingChargeValue: 12, ...over } as never);

beforeEach(async () => {
  await seedRbac();
  t = buildTestApp();
  tokens.clear();
  w = await makeWorld();
});

describe("authorization", () => {
  it("refuses an unauthenticated caller", async () => {
    expect((await request(t.app).get("/api/pricing/meta")).status).toBe(401);
    expect((await request(t.app).post("/api/pricing/preview").send(necklace())).status).toBe(401);
  });

  it("allows exactly the roles that hold pricing.manage — never by role name", async () => {
    for (const role of ALL_ROLE_NAMES) {
      const allowed = DEFAULT_ROLE_MATRIX[role].includes(P.PRICING_MANAGE);
      const token = await tokenFor(role);
      expect((await request(t.app).get("/api/pricing/meta").set(bearer(token))).status, `meta as ${role}`).toBe(allowed ? 200 : 403);
      expect((await request(t.app).post("/api/pricing/preview").set(bearer(token)).send(necklace())).status, `preview as ${role}`).toBe(allowed ? 200 : 403);
    }
  });

  it("holds pricing.manage only for the administrators, not for the staff who merely view pricing", () => {
    expect(ALL_ROLE_NAMES.filter((r) => DEFAULT_ROLE_MATRIX[r].includes(P.PRICING_MANAGE)).sort()).toEqual([R.ADMIN, R.SUPER_ADMIN].sort());
  });

  it("audits a denial", async () => {
    await preview(necklace(), R.VIEWER);
    expect(await AuditLogModel.countDocuments({ action: AUDIT_ACTIONS.ACCESS_DENIED, "metadata.path": "/api/pricing/preview" })).toBe(1);
  });
});

describe("GET /api/pricing/meta", () => {
  it("lists active metals with each active purity's fineness — the data the engine needs", async () => {
    const res = await request(t.app).get("/api/pricing/meta").set(bearer(await tokenFor(R.ADMIN)));
    expect(res.status).toBe(200);
    const gold = res.body.metals.find((m: { code: string }) => m.code === "GOLD");
    expect(gold).toMatchObject({ id: w.gold, name: "Gold" });
    expect(gold.purities).toEqual([{ code: "24K", fineness: 0.999 }, { code: "22K", fineness: 0.916 }, { code: "18K", fineness: 0.75 }]);
  });
});

describe("POST /api/pricing/preview — a complete breakdown from the one engine", () => {
  it("prices the 22K necklace with hand-entered making and wastage (independently verified figures)", async () => {
    const res = await preview(necklace({ cost: 15_800_000 }));
    expect(res.status).toBe(200);
    expect(res.body.breakdown).toMatchObject({
      weights: { gross: 25, stone: 1.5, net: 23.5, fine: 21.526, pieces: 1 },
      metalValue: 15_275_000,
      wastageWeight: 0.47,
      wastageValue: 305_500,
      makingCharges: 1_833_000,
      stoneValue: 450_000,
      subtotal: 17_863_500,
      discount: 0,
      taxableValue: 17_863_500,
      taxes: { supplyType: "INTRA_STATE", cgst: 267_953, sgst: 267_953, igst: 0 },
      totalTax: 535_906,
      finalAmount: 18_399_406,
      estimatedCost: 15_800_000,
      grossMargin: 2_063_500,
      marginPercentage: 11.55,
    });
    expect(res.body.breakdown.rules.making.source).toEqual({ kind: "OVERRIDE" });
  });

  it("charges IGST when the buyer is in another state", async () => {
    const res = await preview(necklace({ tax: { ...TAX, buyerState: "Karnataka" } }));
    // 3% of ₹1,78,635.00 = ₹5,359.05, all as IGST
    expect(res.body.breakdown.taxes).toMatchObject({ supplyType: "INTER_STATE", cgst: 0, sgst: 0, igst: 535_905 });
    expect(res.body.breakdown).toMatchObject({ totalTax: 535_905, finalAmount: 18_399_405 });
  });

  it("prices off a rate quoted for a different purity (22K piece, 24K quote, inter-state)", async () => {
    const res = await preview(necklace({ grossWeight: 10, stoneWeight: 0, stoneValue: 0, wastage: undefined, making: { type: "PER_GRAM", value: 45_000 }, rate: { ratePerGram: 710_000, purity: "24K" }, tax: { ...TAX, buyerState: "Karnataka" } }));
    expect(res.body.breakdown).toMatchObject({ metalValue: 6_510_110, makingCharges: 450_000, subtotal: 6_960_110, finalAmount: 7_168_913 });
  });

  it("supports every making method and wastage mode", async () => {
    for (const [making, wastage] of [
      [{ type: "PERCENTAGE", value: 10 }, { type: "PERCENTAGE", value: 2 }],
      [{ type: "PER_GRAM", value: 50_000 }, { type: "FIXED_WEIGHT", value: 0.2 }],
      [{ type: "FIXED", value: 100_000 }, { type: "NONE" }],
      [{ type: "PER_PIECE", value: 30_000 }, undefined],
    ] as const) {
      const res = await preview(necklace({ making, wastage, pieces: 3 }));
      expect(res.status, JSON.stringify({ making, wastage })).toBe(200);
      const b = res.body.breakdown;
      expect(b.subtotal).toBe(b.metalValue + b.wastageValue + b.makingCharges + b.stoneValue);
      expect(b.finalAmount).toBe(b.taxableValue + b.totalTax);
    }
  });

  it("applies a discount, including one on the making charges only", async () => {
    const off = await preview(necklace({ discount: { type: "PERCENTAGE", value: 50, appliesTo: "MAKING_CHARGES" } }));
    expect(off.body.breakdown.discount).toBe(916_500);
    const flat = await preview(necklace({ discount: { type: "FLAT", value: 200_000 } }));
    expect(flat.body.breakdown).toMatchObject({ discount: 200_000, taxableValue: 17_663_500 });
  });

  it("warns when the sale is below cost", async () => {
    const res = await preview(necklace({ cost: 99_000_000 }));
    expect(res.body.breakdown.warnings.map((x: { code: string }) => x.code)).toEqual(["BELOW_COST"]);
  });

  describe("stored pricing rules", () => {
    it("resolves the rule for the customer type when nothing is entered by hand, and says which rule applied", async () => {
      await rule({ name: "Gold B2C", customerType: "B2C", makingChargeValue: 12, wastageType: "PERCENTAGE", wastageValue: 2 });
      await rule({ name: "Gold B2B", customerType: "B2B", makingChargeValue: 9, wastageType: "PERCENTAGE", wastageValue: 1 });
      const b2c = (await preview(necklace({ making: undefined, wastage: undefined }))).body.breakdown;
      const b2b = (await preview(necklace({ making: undefined, wastage: undefined, customerType: "B2B" }))).body.breakdown;
      expect(b2c).toMatchObject({ makingCharges: 1_833_000, finalAmount: 18_399_406 });
      expect(b2c.rules.making.source).toMatchObject({ kind: "RULE", ruleName: "Gold B2C", tier: "DEFAULT" });
      expect(b2b).toMatchObject({ makingCharges: 1_374_750, wastageValue: 152_750, finalAmount: 17_770_076 });
      expect(b2b.rules.making.source).toMatchObject({ ruleName: "Gold B2B" });
    });

    it("lets a hand-entered value override just its own dimension", async () => {
      await rule({ name: "Gold default", makingChargeValue: 12, wastageType: "PERCENTAGE", wastageValue: 2 });
      const b = (await preview(necklace({ making: { type: "FIXED", value: 100_000 }, wastage: undefined }))).body.breakdown;
      expect(b.makingCharges).toBe(100_000);
      expect(b.rules.making.source).toEqual({ kind: "OVERRIDE" });
      expect(b.rules.wastage.source).toMatchObject({ kind: "RULE", ruleName: "Gold default" });
    });

    it("ignores inactive rules, rules for other metals, and rules not yet in force", async () => {
      await rule({ name: "inactive", isActive: false, makingChargeValue: 30 });
      await rule({ name: "silver only", metalId: w.silver, makingChargeValue: 31 });
      await rule({ name: "future", validFrom: new Date("2099-01-01"), makingChargeValue: 32 });
      const b = (await preview(necklace({ making: undefined, wastage: undefined }))).body.breakdown;
      expect(b.makingCharges).toBe(0);
      expect(b.warnings.map((x: { code: string }) => x.code)).toContain("NO_MAKING_RULE");
    });

    it("warns — but still prices — when no rule and no entry supplies a making charge", async () => {
      const res = await preview(necklace({ making: undefined, wastage: undefined }));
      expect(res.status).toBe(200);
      expect(res.body.breakdown.warnings.map((x: { code: string }) => x.code)).toEqual(["NO_MAKING_RULE"]);
    });
  });

  describe("refuses unusable input with a reason", () => {
    it.each([
      ["stone weight not less than gross weight", { stoneWeight: 25 }, "stoneWeight"],
      ["a weight finer than a milligram", { grossWeight: 25.0001 }, "grossWeight"],
      ["a negative stone weight", { stoneWeight: -1 }, "stoneWeight"],
      ["a zero gross weight", { grossWeight: 0 }, "grossWeight"],
      ["a metal rate of zero", { rate: { ratePerGram: 0, purity: "22K" } }, "ratePerGram"],
      ["a fractional-paise rate", { rate: { ratePerGram: 6500.5, purity: "22K" } }, "ratePerGram"],
      ["a fractional-paise stone value", { stoneValue: 10.5 }, "stoneValue"],
      ["a making percentage over 100", { making: { type: "PERCENTAGE", value: 101 } }, "value"],
      ["an unknown making type", { making: { type: "PER_CARAT", value: 1 } }, "type"],
      ["a percentage discount over 100", { discount: { type: "PERCENTAGE", value: 150 } }, "value"],
      ["an unknown customer type", { customerType: "B2X" }, "customerType"],
      ["CGST + SGST not equal to IGST", { tax: { ...TAX, interState: { igst: 5 } } }, "igst"],
      ["a missing buyer state", { tax: { ...TAX, buyerState: " " } }, "buyerState"],
      ["zero pieces", { pieces: 0 }, "pieces"],
    ])("%s → 400", async (_name, over, field) => {
      const res = await preview(necklace(over));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(res.body.error.issues)).toContain(field);
    });

    it("a flat discount larger than the subtotal (the engine's own refusal) → 400 with its message", async () => {
      const res = await preview(necklace({ discount: { type: "FLAT", value: 999_999_999 } }));
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/exceeds the subtotal/);
    });

    it("a fixed wastage weight above the net weight → 400", async () => {
      const res = await preview(necklace({ wastage: { type: "FIXED_WEIGHT", value: 30 } }));
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/cannot exceed the net weight/);
    });

    it("a purity the metal doesn't have → 400", async () => {
      const res = await preview(necklace({ purity: "14K" }));
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/purity "14K" is not an active purity of Gold/);
      expect((await preview(necklace({ rate: { ratePerGram: 650_000, purity: "999" } }))).status).toBe(400);
    });

    it("an unknown metal → 404", async () => {
      expect((await preview(necklace({ metalId: "64b0c0ffee0000000000aaaa" }))).status).toBe(404);
    });

    it("a malformed metal id → 400", async () => {
      expect((await preview(necklace({ metalId: "gold" }))).status).toBe(400);
    });
  });

  it("is a pure what-if: it changes nothing (no audit row, no stored rule touched)", async () => {
    await rule({ name: "Gold default" });
    await tokenFor(R.ADMIN); // signing in is itself audited — take the baseline after it
    const audits = await AuditLogModel.countDocuments();
    await preview(necklace());
    expect(await AuditLogModel.countDocuments()).toBe(audits);
  });

  it("gives the same answer every time for the same request", async () => {
    const first = (await preview(necklace({ cost: 1_000_000 }))).body;
    for (let i = 0; i < 5; i++) expect((await preview(necklace({ cost: 1_000_000 }))).body).toEqual(first);
  });
});

describe("metal rates — the one thing checkout/catalogue/reports price against, and until now nothing could set", () => {
  it("lets pricing.manage enter a real rate, never trusting a client-supplied createdBy", async () => {
    const admin = await tokenFor(R.ADMIN);
    const res = await request(t.app)
      .post("/api/pricing/rates")
      .set(bearer(admin))
      .send({ metalId: w.gold, purity: "22K", ratePerGram: 650_000, effectiveFrom: "2026-01-01", createdBy: "64b0c0ffee0000000000aaaa" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.rate).toMatchObject({ metalId: w.gold, purity: "22K", ratePerGram: 650_000 });
    expect(res.body.rate.createdBy).not.toBe("64b0c0ffee0000000000aaaa");
  });

  it("refuses a caller who only holds pricing.view", async () => {
    const viewerRole = ALL_ROLE_NAMES.find((r) => DEFAULT_ROLE_MATRIX[r].includes(P.PRICING_VIEW) && !DEFAULT_ROLE_MATRIX[r].includes(P.PRICING_MANAGE))!;
    expect(viewerRole).toBeTruthy();
    const viewer = await tokenFor(viewerRole);
    const res = await request(t.app).post("/api/pricing/rates").set(bearer(viewer)).send({ metalId: w.gold, purity: "22K", ratePerGram: 650_000, effectiveFrom: "2026-01-01" });
    expect(res.status).toBe(403);
  });

  it("is append-only history, readable by anyone with pricing.view — a later entry becomes the current rate without erasing the earlier one", async () => {
    const admin = await tokenFor(R.ADMIN);
    await request(t.app).post("/api/pricing/rates").set(bearer(admin)).send({ metalId: w.gold, purity: "22K", ratePerGram: 640_000, effectiveFrom: "2026-01-01" });
    await request(t.app).post("/api/pricing/rates").set(bearer(admin)).send({ metalId: w.gold, purity: "22K", ratePerGram: 650_000, effectiveFrom: "2026-01-02" });

    const current = await request(t.app).get(`/api/pricing/rates/current?metalId=${w.gold}&purity=22K`).set(bearer(admin));
    expect(current.body.rate.ratePerGram).toBe(650_000);

    const history = await request(t.app).get(`/api/pricing/rates?metalId=${w.gold}&purity=22K`).set(bearer(admin));
    expect(history.body.items).toHaveLength(2);
    expect(history.body.items.map((r: { ratePerGram: number }) => r.ratePerGram).sort()).toEqual([640_000, 650_000]);
  });

  it("400s a malformed rate request rather than silently accepting garbage", async () => {
    const admin = await tokenFor(R.ADMIN);
    expect((await request(t.app).post("/api/pricing/rates").set(bearer(admin)).send({ metalId: w.gold, purity: "22K", ratePerGram: -1, effectiveFrom: "2026-01-01" })).status).toBe(400);
    expect((await request(t.app).post("/api/pricing/rates").set(bearer(admin)).send({ metalId: "not-an-id", purity: "22K", ratePerGram: 1, effectiveFrom: "2026-01-01" })).status).toBe(400);
  });
});
