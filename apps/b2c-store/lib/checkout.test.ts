import { describe, expect, it } from "vitest";
import { EMPTY_CONTACT, blockingIssues, describeOrder, requestSignature, toVerifyBody, validateContact } from "./checkout";

const good = { ...EMPTY_CONTACT, fullName: "Asha Rao", email: "Asha@Example.com", phone: "+91 98765 43210", addressLine1: "12 MG Road", city: "Pune", state: "maharashtra", postalCode: "411001" };

describe("contact validation (the same rules the API applies)", () => {
  it("accepts a complete address and normalises it", () => {
    const r = validateContact(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.contact).toMatchObject({ email: "asha@example.com", phone: "9876543210", state: "Maharashtra" });
  });
  it("reports each problem against its field", () => {
    const r = validateContact({ ...good, phone: "12345", postalCode: "ABC", state: "Atlantis", email: "nope" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["email", "phone", "postalCode", "state"]);
  });
});

describe("what the browser sends", () => {
  const lines = [{ slug: "plain-band", variantSku: "PB-12", quantity: 2 }];
  it("is only which pieces, how many, where to and how — never a price", () => {
    expect(toVerifyBody(lines, "Goa", "standard")).toEqual({ lines: [{ slug: "plain-band", variantSku: "PB-12", quantity: 2 }], state: "Goa", deliveryCode: "standard" });
    expect(JSON.stringify(toVerifyBody(lines, "Goa", "standard"))).not.toMatch(/price|total|discount/i);
  });
  it("gives the same request the same signature, and any change a different one", () => {
    expect(requestSignature(lines, good, "standard")).toBe(requestSignature([...lines], { ...good }, "standard"));
    expect(requestSignature(lines, good, "express")).not.toBe(requestSignature(lines, good, "standard"));
    expect(requestSignature([{ ...lines[0]!, quantity: 3 }], good, "standard")).not.toBe(requestSignature(lines, good, "standard"));
  });
  it("does not treat 'you haven't chosen delivery yet' as a blocker on earlier steps", () => {
    expect(blockingIssues([{ code: "DELIVERY_NOT_CHOSEN", message: "x" }, { code: "UNAVAILABLE", message: "y", slug: "a" }]).map((i) => i.code)).toEqual(["UNAVAILABLE"]);
  });
});

describe("telling the customer about an order", () => {
  it("is honest that a failed payment charged nothing and can be retried", () => {
    const d = describeOrder({ status: "PAYMENT_FAILED", canPay: true });
    expect(d.tone).toBe("bad");
    expect(d.body).toMatch(/nothing was charged/i);
    expect(d.body).toMatch(/try again/i);
  });
  it("says a cancelled paid order is being refunded, and an unpaid one cost nothing", () => {
    expect(describeOrder({ status: "CANCELLED", canPay: false, payment: { id: "p", status: "CAPTURED", amount: 1, refundedAmount: 0 } }).body).toMatch(/refund/i);
    expect(describeOrder({ status: "CANCELLED", canPay: false }).body).toMatch(/nothing was charged/i);
  });
});
