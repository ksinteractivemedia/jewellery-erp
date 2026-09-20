import { describe, expect, it } from "vitest";
import { createUser } from "./modules/auth/user.service";
import { createMetal } from "./modules/metals/metal.repository";
import { createProduct } from "./modules/catalog/product.repository";
import { createBranch } from "./modules/organization/branch.repository";
import { createCompany } from "./modules/organization/company.repository";
import { createLocation } from "./modules/organization/location.repository";
import { createInventoryItem } from "./modules/inventory/inventory-item.service";

async function makeCompanyBranchLocation() {
  const company = await createCompany({
    name: "Suvarna Jewellers",
    legalName: "Suvarna Jewellers Pvt. Ltd.",
    address: { line1: "1 MG Road", city: "Mumbai", state: "Maharashtra", postalCode: "400001", country: "India" },
  });
  const branch = await createBranch({
    companyId: company.id,
    name: "Main Store",
    code: "MAIN",
    address: { line1: "1 MG Road", city: "Mumbai", state: "Maharashtra", postalCode: "400001", country: "India" },
  });
  return createLocation({ branchId: branch.id, name: "Counter 1", code: "C1", type: "COUNTER" });
}

describe("uniqueness constraints", () => {
  it("rejects two users with the same email", async () => {
    const input = { email: "priya@suvarna.example", name: "Priya Sharma", password: "supersecret1", userType: "STAFF" as const };
    await createUser(input);
    await expect(createUser({ ...input, name: "Someone Else" })).rejects.toThrow();
  });

  it("rejects two branches in the same company with the same code, but allows the same code in a different company", async () => {
    const companyA = await createCompany({
      name: "Company A",
      legalName: "Company A Pvt. Ltd.",
      address: { line1: "A", city: "Mumbai", state: "Maharashtra", postalCode: "400001", country: "India" },
    });
    const companyB = await createCompany({
      name: "Company B",
      legalName: "Company B Pvt. Ltd.",
      address: { line1: "B", city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India" },
    });

    await createBranch({ companyId: companyA.id, name: "Branch 1", code: "MAIN", address: { line1: "A", city: "Mumbai", state: "Maharashtra", postalCode: "400001", country: "India" } });

    await expect(
      createBranch({ companyId: companyA.id, name: "Duplicate", code: "MAIN", address: { line1: "A", city: "Mumbai", state: "Maharashtra", postalCode: "400001", country: "India" } })
    ).rejects.toThrow();

    // Same code, different company — allowed, since the unique index is scoped to {companyId, code}.
    await expect(
      createBranch({ companyId: companyB.id, name: "Branch 1", code: "MAIN", address: { line1: "B", city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India" } })
    ).resolves.toBeDefined();
  });

  it("rejects two metals with the same code", async () => {
    await createMetal({ code: "GOLD", name: "Gold" });
    await expect(createMetal({ code: "GOLD", name: "Gold (duplicate)" })).rejects.toThrow();
  });

  it("rejects two products with the same SKU", async () => {
    const metal = await createMetal({ code: "GOLD", name: "Gold" });
    await createProduct({ sku: "RING-001", name: "Rihaan Ring", metalId: metal.id } as never);
    await expect(createProduct({ sku: "RING-001", name: "Duplicate Ring", metalId: metal.id } as never)).rejects.toThrow();
  });

  it("rejects two inventory items with the same itemCode", async () => {
    const [location, metal] = await Promise.all([makeCompanyBranchLocation(), createMetal({ code: "GOLD", name: "Gold", purityOptions: [{ code: "22K", fineness: 0.916, isActive: true }] })]);
    const base = { itemCode: "INV-DUP-1", type: "FINISHED_JEWELLERY", serialization: "UNIT", grossWeight: 10, stoneWeight: 0, metalId: metal.id, purity: "22K", locationId: location.id, cost: 40000 };

    await createInventoryItem(base as never);
    await expect(createInventoryItem(base as never)).rejects.toThrow();
  });

  it("rejects two inventory items with the same HUID", async () => {
    const [location, metal] = await Promise.all([makeCompanyBranchLocation(), createMetal({ code: "GOLD", name: "Gold", purityOptions: [{ code: "22K", fineness: 0.916, isActive: true }] })]);
    const huid = "HK8X2M";

    await createInventoryItem({
      itemCode: "INV-A",
      type: "FINISHED_JEWELLERY",
      serialization: "UNIT",
      grossWeight: 10,
      stoneWeight: 0,
      metalId: metal.id,
      purity: "22K",
      locationId: location.id,
      cost: 40000,
      huid,
    } as never);

    await expect(
      createInventoryItem({
        itemCode: "INV-B",
        type: "FINISHED_JEWELLERY",
        serialization: "UNIT",
        grossWeight: 12,
        stoneWeight: 0,
        metalId: metal.id,
        purity: "22K",
        locationId: location.id,
        cost: 45000,
        huid,
      } as never)
    ).rejects.toThrow();
  });
});
