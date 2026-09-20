import type { InventoryItem, InventoryStatus, LocationType, MovementType } from "@jewellery/types";

/** Locations that actually hold our stock (as opposed to partners who hold it on our behalf). */
export const STOCK_LOCATION_TYPES: LocationType[] = ["STORE", "WAREHOUSE", "COUNTER", "VAULT"];

type Transition = [from: InventoryStatus, to: InventoryStatus];

export interface MovementRule {
  /**
   * Every (from → to) pair this movement may perform. A movement is a *named business event*, so it
   * is narrower than the general status graph (status-transitions.ts): the graph says what is
   * physically possible, the rule says which event may cause it. Both are checked.
   */
  transitions: Transition[];
  /** If set, the destination location must be one of these types. */
  destination?: LocationType[];
  /** True if this movement may bring a brand-new item into existence (no `from`). */
  creates?: boolean;
}

const t = (from: InventoryStatus | InventoryStatus[], to: InventoryStatus): Transition[] => (Array.isArray(from) ? from : [from]).map((f) => [f, to]);

/**
 * The stock movement table — what each ledger movement type is allowed to do. Anything not listed
 * is refused before a single write happens. This is where "SALE can't take a RESERVED-for-someone-
 * else piece", "TRANSFER_IN only completes a TRANSFER_OUT" and "you can't hallmark a sold piece" live.
 */
export const MOVEMENT_RULES: Record<MovementType, MovementRule> = {
  PURCHASE_RECEIPT: { transitions: [], creates: true, destination: STOCK_LOCATION_TYPES },
  SALE: { transitions: t(["AVAILABLE", "RESERVED"], "SOLD") },
  // SOLD → RETURNED when the piece comes back; RETURNED → AVAILABLE/DAMAGED is the inspection outcome.
  RETURN: { transitions: [...t("SOLD", "RETURNED"), ...t("RETURNED", "AVAILABLE"), ...t("RETURNED", "DAMAGED")], destination: STOCK_LOCATION_TYPES },
  TRANSFER_OUT: { transitions: t("AVAILABLE", "IN_TRANSIT"), destination: STOCK_LOCATION_TYPES },
  TRANSFER_IN: { transitions: t("IN_TRANSIT", "AVAILABLE"), destination: STOCK_LOCATION_TYPES },
  RESERVATION: { transitions: t("AVAILABLE", "RESERVED") },
  RELEASE_RESERVATION: { transitions: t("RESERVED", "AVAILABLE") },
  MANUFACTURING_ISSUE: { transitions: t("AVAILABLE", "IN_MANUFACTURING"), destination: ["MANUFACTURING_UNIT"] },
  MANUFACTURING_RECEIPT: { transitions: t("IN_MANUFACTURING", "AVAILABLE"), creates: true, destination: STOCK_LOCATION_TYPES },
  JOBWORK_ISSUE: { transitions: t("AVAILABLE", "WITH_JOB_WORKER"), destination: ["JOB_WORKER"] },
  JOBWORK_RECEIPT: { transitions: t("WITH_JOB_WORKER", "AVAILABLE"), creates: true, destination: STOCK_LOCATION_TYPES },
  REPAIR_OUT: { transitions: t(["AVAILABLE", "DAMAGED"], "UNDER_REPAIR"), destination: ["REPAIR_CENTER"] },
  REPAIR_IN: { transitions: t("UNDER_REPAIR", "AVAILABLE"), destination: STOCK_LOCATION_TYPES },
  HALLMARKING_OUT: { transitions: t("AVAILABLE", "HALLMARKING"), destination: ["HALLMARKING_CENTER"] },
  HALLMARKING_IN: { transitions: t("HALLMARKING", "AVAILABLE"), destination: STOCK_LOCATION_TYPES },
  // Corrections may move between any legal statuses, or keep the status and change weight/quantity.
  ADJUSTMENT: { transitions: [], creates: true },
  SCRAP: { transitions: t(["AVAILABLE", "RETURNED", "DAMAGED", "UNDER_REPAIR", "IN_MANUFACTURING"], "SCRAP") },
  MELTING: { transitions: t(["AVAILABLE", "DAMAGED", "IN_MANUFACTURING", "SCRAP"], "MELTING") },
};

export const isCreationMovement = (type: MovementType) => MOVEMENT_RULES[type].creates === true;

/** The status this movement ends in when starting from `from`, or undefined if it isn't allowed. Ambiguous ones (RETURN from RETURNED) need the caller to choose. */
export function allowedTargets(type: MovementType, from: InventoryStatus): InventoryStatus[] {
  return MOVEMENT_RULES[type].transitions.filter(([f]) => f === from).map(([, to]) => to);
}

/** Statuses in which the business still owns (or holds custody of) the piece — i.e. what counts as stock and as inventory value. */
export const OWNED_STATUSES: InventoryStatus[] = [
  "AVAILABLE", "RESERVED", "RETURNED", "DAMAGED", "UNDER_REPAIR", "IN_MANUFACTURING", "WITH_JOB_WORKER", "IN_TRANSIT", "HALLMARKING", "SCRAP",
];
export const isOwnedStock = (status: InventoryStatus) => OWNED_STATUSES.includes(status);

/** The one definition of "can be sold right now": on the shelf, finished, un-held, and something to sell. */
export const isAvailableForSale = (item: Pick<InventoryItem, "status" | "type" | "quantity" | "reservation">) =>
  item.status === "AVAILABLE" && item.type === "FINISHED_JEWELLERY" && !item.reservation && item.quantity > 0;
