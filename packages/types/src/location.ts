import type { Id, Timestamps } from "./common";

export type LocationType =
  | "STORE"
  | "WAREHOUSE"
  | "COUNTER"
  | "VAULT"
  | "JOB_WORKER"
  | "HALLMARKING_CENTER"
  | "REPAIR_CENTER"
  | "IN_TRANSIT_VIRTUAL";

/** A stock-keeping point within a Branch — a counter, vault, workshop, or a virtual location like "in transit". */
export interface Location extends Timestamps {
  id: Id;
  branchId: Id;
  name: string;
  code: string;
  type: LocationType;
  isActive: boolean;
}
