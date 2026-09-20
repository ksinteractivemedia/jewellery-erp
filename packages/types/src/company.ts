import type { Address, Id, Timestamps } from "./common";

/** The legal business entity. Almost always a single document; modeled as a collection so a group of companies is not a rewrite. */
export interface Company extends Timestamps {
  id: Id;
  name: string;
  legalName: string;
  gstin?: string;
  pan?: string;
  address: Address;
  contactEmail?: string;
  contactPhone?: string;
  isActive: boolean;
}
