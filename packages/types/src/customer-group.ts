import type { Id, Timestamps } from "./common";

/** B2B tiering (e.g. "Retailer", "Distributor") — the default pricing-rule/price-list scope target for a group of customers. */
export interface CustomerGroup extends Timestamps {
  id: Id;
  name: string;
  description?: string;
  isActive: boolean;
}
