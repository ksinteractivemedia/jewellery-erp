import type { Address, CustomerType, Id, Timestamps } from "./common";

/** Unified B2C/B2B customer — one model, discriminated by `type` (business-rules.md §3.1's sibling rule for parties). */
export interface Customer extends Timestamps {
  id: Id;
  type: CustomerType;
  name: string;
  email?: string;
  phone?: string;
  /** B2B only. */
  gstin?: string;
  customerGroupId?: Id;
  billingAddress?: Address;
  shippingAddresses: Address[];
  /** Links to the portal login, once auth exists. */
  channelUserId?: Id;
  isActive: boolean;
}
