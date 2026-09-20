import { Types } from "mongoose";
import type { InventoryItem, LocationType } from "@jewellery/types";
import { receiveNewInventoryItem } from "../src/modules/inventory/inventory-transaction.service";
import { createMetal } from "../src/modules/metals/metal.repository";
import { createBranch } from "../src/modules/organization/branch.repository";
import { createCompany } from "../src/modules/organization/company.repository";
import { createLocation } from "../src/modules/organization/location.repository";

const address = { line1: "1 MG Road", city: "Mumbai", state: "Maharashtra", postalCode: "400001", country: "India" };

const LOCATIONS: [key: string, type: LocationType][] = [
  ["counter", "COUNTER"],
  ["store2", "STORE"],
  ["warehouse", "WAREHOUSE"],
  ["vault", "VAULT"],
  ["workshop", "MANUFACTURING_UNIT"],
  ["jobworker", "JOB_WORKER"],
  ["hallmark", "HALLMARKING_CENTER"],
  ["repair", "REPAIR_CENTER"],
];

/** One company/branch, a location of every type, and gold/silver — the world every inventory test starts from. */
export async function makeWorld() {
  const company = await createCompany({ name: "Suvarna Jewellers", legalName: "Suvarna Jewellers Pvt. Ltd.", address });
  const branch = await createBranch({ companyId: company.id, name: "Main Store", code: "MAIN", address });
  const loc: Record<string, string> = {};
  for (const [key, type] of LOCATIONS) loc[key] = (await createLocation({ branchId: branch.id, name: `${key[0]!.toUpperCase()}${key.slice(1)}`, code: key.toUpperCase(), type })).id;
  const gold = await createMetal({ code: "GOLD", name: "Gold", purityOptions: [{ code: "24K", fineness: 0.999, isActive: true }, { code: "22K", fineness: 0.916, isActive: true }, { code: "18K", fineness: 0.75, isActive: true }] });
  const silver = await createMetal({ code: "SILVER", name: "Silver", purityOptions: [{ code: "925", fineness: 0.925, isActive: true }] });
  return { loc, gold: gold.id, silver: silver.id, branchId: branch.id };
}
export type World = Awaited<ReturnType<typeof makeWorld>>;

export const someUser = () => new Types.ObjectId().toString();
export const someOrder = () => new Types.ObjectId().toString();

let n = 0;
/** Receives one finished 22K gold piece into `world.loc.counter` through the real receipt path (so it has a ledger). */
export async function receive(world: World, over: Record<string, unknown> = {}): Promise<InventoryItem> {
  const { item } = await receiveNewInventoryItem({
    item: {
      itemCode: `T-${++n}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase(),
      type: "FINISHED_JEWELLERY",
      serialization: "UNIT",
      grossWeight: 10,
      stoneWeight: 0,
      metalId: world.gold,
      purity: "22K",
      locationId: world.loc.counter,
      cost: 50_000_00,
      ...over,
    } as never,
    performedBy: someUser(),
    channel: "ERP",
    referenceType: "MANUAL",
  });
  return item;
}
