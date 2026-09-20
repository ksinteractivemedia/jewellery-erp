import type { Address, Id, Timestamps } from "./common";

export interface Supplier extends Timestamps {
  id: Id;
  name: string;
  gstin?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: Address;
  paymentTermsDays: number;
  isActive: boolean;
}
