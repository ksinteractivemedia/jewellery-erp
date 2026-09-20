import { describe, expect, it } from "vitest";
import { createCompany } from "./company.repository";

const validCompany = {
  name: "Suvarna Jewellers",
  legalName: "Suvarna Jewellers Pvt. Ltd.",
  gstin: "27AAACJ1234E1Z5",
  address: {
    line1: "123 MG Road",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400001",
    country: "India",
  },
};

describe("company.repository", () => {
  it("creates a company and returns the DTO shape (id, not _id)", async () => {
    const company = await createCompany(validCompany);
    expect(company.id).toBeTypeOf("string");
    expect(company.gstin).toBe("27AAACJ1234E1Z5");
    expect((company as unknown as { _id?: unknown })._id).toBeUndefined();
  });

  it("rejects a duplicate GSTIN", async () => {
    await createCompany(validCompany);
    await expect(createCompany({ ...validCompany, name: "Different Name" })).rejects.toThrow();
  });
});
