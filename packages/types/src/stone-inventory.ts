import type { Id, Paise, Timestamps } from "./common";
import type { StoneUnit } from "./stone";

export type StoneInventoryStatus = "AVAILABLE" | "RESERVED" | "ISSUED_TO_MANUFACTURING" | "SOLD" | "RETURNED" | "DAMAGED";

/**
 * A lot of loose stones held as raw material, before being set into a piece. Tracked
 * separately from `InventoryItem` because its attributes (carat, clarity, certificate)
 * don't overlap with metal-piece attributes (gross/net/fine weight, HUID).
 */
export interface StoneInventoryLot extends Timestamps {
  id: Id;
  stoneId: Id;
  itemCode: string;
  shape?: string;
  size?: string;
  caratWeight: number;
  clarity?: string;
  color?: string;
  certificateNumber?: string;
  certificateAuthority?: string;
  cost: Paise;
  quantity: number;
  unit: StoneUnit;
  locationId: Id;
  status: StoneInventoryStatus;
}
