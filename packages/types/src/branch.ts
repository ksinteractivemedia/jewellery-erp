import type { Address, Id, Timestamps } from "./common";

/** A showroom/office under a Company. GSTIN is per-branch — Indian GST registration is state-wise. */
export interface Branch extends Timestamps {
  id: Id;
  companyId: Id;
  name: string;
  code: string;
  gstin?: string;
  address: Address;
  contactPhone?: string;
  isActive: boolean;
}
