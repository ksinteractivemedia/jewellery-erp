import type { Id, Timestamps } from "./common";

export type TransferStatus = "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
export type TransferLineState = "PENDING" | "RECEIVED" | "RETURNED";

export interface StockTransferLine {
  itemId: Id;
  itemCode: string;
  state: TransferLineState;
  resolvedAt?: Date;
}

/**
 * A movement of pieces between two stock-holding locations, in two ledger steps:
 * TRANSFER_OUT (AVAILABLE → IN_TRANSIT, at dispatch) and TRANSFER_IN (IN_TRANSIT → AVAILABLE,
 * at receipt). While a piece is IN_TRANSIT its location is the destination — "on its way to B" —
 * so it is counted neither as available at the source nor at the destination.
 */
export interface StockTransfer extends Timestamps {
  id: Id;
  transferNo: string;
  fromLocationId: Id;
  toLocationId: Id;
  status: TransferStatus;
  lines: StockTransferLine[];
  notes?: string;
  dispatchedBy: Id;
  dispatchedAt: Date;
  closedBy?: Id;
  closedAt?: Date;
}
