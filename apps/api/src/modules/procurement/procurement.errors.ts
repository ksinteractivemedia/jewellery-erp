import { AppError } from "../../shared/errors";

/** Receiving more of a line than is still outstanding against the purchase order. */
export class OverReceiptError extends AppError {
  constructor(description: string, wanted: number, outstanding: number, unit: "g" | "pcs") {
    super(`${description}: trying to receive ${wanted}${unit === "g" ? " g" : " pcs"}, but only ${outstanding}${unit === "g" ? " g" : " pcs"} is still outstanding on this line.`, "OVER_RECEIPT", { wanted, outstanding, unit });
  }
}
/** The purity actually received doesn't match what was ordered — a defining commercial attribute, not a rounding difference. */
export class PurityMismatchError extends AppError {
  constructor(description: string, ordered: string, received: string) {
    super(`${description}: ordered ${ordered} but the receipt says ${received}. If this is really what arrived, raise a new purchase order or correct the receipt.`, "PURITY_MISMATCH", { ordered, received });
  }
}
