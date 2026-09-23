import type { Address, Grams, Id } from "./common";

/**
 * Inventory Item → Send to Hallmarking → In Transit → At Hallmarking Centre → Received → Verified →
 * Failed, as explicit statuses (hallmarking-status.ts is the one place transitions are named and
 * checked — the same discipline as every other workflow module). `IN_TRANSIT`/`AT_CENTRE` are the
 * batch's own shared logistics stage (the whole shipment travels together); `VERIFIED`/`FAILED` are
 * necessarily per PIECE, once the batch is back (see `HallmarkingLine.outcome`) — one shipment can
 * come back with some pieces correctly marked and one that isn't.
 */
export const HALLMARKING_BATCH_STATUSES = ["PENDING", "IN_TRANSIT", "AT_CENTRE", "RECEIVED", "CANCELLED"] as const;
export type HallmarkingBatchStatus = (typeof HALLMARKING_BATCH_STATUSES)[number];

export const HALLMARKING_LINE_OUTCOMES = ["VERIFIED", "FAILED"] as const;
export type HallmarkingLineOutcome = (typeof HALLMARKING_LINE_OUTCOMES)[number];

/**
 * Where an item actually stands, for display and for the dashboard's tabs: the batch's shared stage
 * until the piece has its own outcome, then the outcome. Never stored — always read off the line and
 * its batch.
 */
export type HallmarkingEffectiveStatus = HallmarkingBatchStatus | HallmarkingLineOutcome;

/**
 * An assaying/hallmarking centre — reference data, never a hardcoded list, so a new centre or a
 * closed one is a data change, not a code change (the module's one nod to "don't hardcode regulatory
 * assumptions" beyond the HUID's own shared shape, `zHuid`, already a single central definition).
 */
export interface AssayingCentre {
  id: Id;
  name: string;
  code: string;
  bisRegistrationNumber?: string;
  locationId: Id;
  locationName: string;
  address?: Address;
  contactPhone?: string;
  contactEmail?: string;
  isActive: boolean;
}

export interface HallmarkingHistoryEntry {
  status: string;
  at: string;
  by: Id;
  byName?: string;
  note?: string;
}

export interface HallmarkingLine {
  itemId: Id;
  itemCode: string;
  /** Snapshot at dispatch — a later purity-table correction never rewrites a past request. */
  purity: string;
  grossWeight: Grams;
  /** Where the item lived before being sent — a return goes back there (never into the centre's own location, which isn't a stock location). */
  fromLocationId: Id;
  huid?: string;
  certificateNumber?: string;
  hallmarkDate?: string;
  outcome?: HallmarkingLineOutcome;
  failureReason?: string;
  effectiveStatus: HallmarkingEffectiveStatus;
}

export interface HallmarkingBatch {
  id: Id;
  hallmarkingNo: string;
  status: HallmarkingBatchStatus;
  assayingCentre: { id: Id; name: string };
  sentDate?: string;
  expectedReturnDate?: string;
  notes?: string;
  lines: HallmarkingLine[];
  history: HallmarkingHistoryEntry[];
  createdAt: string;
}

export interface HallmarkingDashboard {
  counts: { pending: number; inTransit: number; atCentre: number; received: number; verified: number; failed: number };
}
