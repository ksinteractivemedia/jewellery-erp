import type { LocationType, MovementType } from "@jewellery/types";

/** Integer paise → rupees for the display components (which take rupees). Display only — never fed back to the API. */
export const rupees = (paise: number) => paise / 100;

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  PURCHASE_RECEIPT: "Purchase receipt",
  SALE: "Sale",
  RETURN: "Return",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
  RESERVATION: "Reserved",
  RELEASE_RESERVATION: "Reservation released",
  MANUFACTURING_ISSUE: "Issued to manufacturing",
  MANUFACTURING_RECEIPT: "Received from manufacturing",
  JOBWORK_ISSUE: "Issued to job worker",
  JOBWORK_RECEIPT: "Received from job worker",
  REPAIR_OUT: "Sent for repair",
  REPAIR_IN: "Received from repair",
  HALLMARKING_OUT: "Sent for hallmarking",
  HALLMARKING_IN: "Received from hallmarking",
  ADJUSTMENT: "Adjustment",
  SCRAP: "Scrapped",
  MELTING: "Sent for melting",
  EXCHANGE_IN: "Taken in on exchange",
  REPAIR_INTAKE: "Repair intake (customer-owned)",
  REPAIR_RETURN: "Handed back after repair",
};

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  STORE: "Retail store",
  WAREHOUSE: "Warehouse",
  COUNTER: "Counter",
  VAULT: "Vault",
  JOB_WORKER: "Job worker",
  HALLMARKING_CENTER: "Hallmarking centre",
  REPAIR_CENTER: "Repair centre",
  MANUFACTURING_UNIT: "Manufacturing unit",
  IN_TRANSIT_VIRTUAL: "In transit",
};

/** Locations that hold our own stock, as opposed to partners who hold it on our behalf. Mirrors the API rule — the API enforces it. */
export const STOCK_LOCATION_TYPES: LocationType[] = ["STORE", "WAREHOUSE", "COUNTER", "VAULT"];

export const shortId = (id: string) => id.slice(-6).toUpperCase();

/** A reference for a hold placed by hand (no order exists yet): 24 hex characters, like every other id. */
export function newHoldReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
