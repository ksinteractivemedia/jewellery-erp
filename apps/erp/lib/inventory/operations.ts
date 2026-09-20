import type { InventoryStatus, LocationType } from "@jewellery/types";
import type { PartnerMovementInput } from "@jewellery/validation";
import { STOCK_LOCATION_TYPES } from "./format";

export type OperationKind = "TRANSFER" | PartnerMovementInput["type"] | "INSPECT_AVAILABLE" | "INSPECT_DAMAGED";

export interface OperationSpec {
  kind: OperationKind;
  label: string;
  help: string;
  /** Where the pieces go (or, for a return trip, where they land). */
  destinationLabel: string;
  destinationTypes: LocationType[];
  /** Needs a HUID per piece (hallmarking returns). */
  asksHuid?: boolean;
}

const OUT = (kind: OperationKind, label: string, help: string, type: LocationType, destinationLabel: string): OperationSpec => ({ kind, label, help, destinationLabel, destinationTypes: [type] });
const BACK = (kind: OperationKind, label: string, help: string, extra: Partial<OperationSpec> = {}): OperationSpec => ({ kind, label, help, destinationLabel: "Receive into", destinationTypes: STOCK_LOCATION_TYPES, ...extra });

/**
 * Which stock operations to *offer* for a selection whose pieces all share one status. This only decides
 * what to show — the API applies the real movement rules and refuses anything else.
 */
export function operationsFor(status: InventoryStatus): OperationSpec[] {
  switch (status) {
    case "AVAILABLE":
      return [
        { kind: "TRANSFER", label: "Transfer to another location", help: "Dispatches the pieces; they stay in transit until received.", destinationLabel: "Transfer to", destinationTypes: STOCK_LOCATION_TYPES },
        OUT("HALLMARKING_OUT", "Send for hallmarking", "Marks them pending hallmarking.", "HALLMARKING_CENTER", "Hallmarking centre"),
        OUT("REPAIR_OUT", "Send for repair", "Pieces stay ours while at the repairer.", "REPAIR_CENTER", "Repair centre"),
        OUT("JOBWORK_ISSUE", "Issue to job worker", "Custody moves to the job worker.", "JOB_WORKER", "Job worker"),
        OUT("MANUFACTURING_ISSUE", "Issue to manufacturing", "Moves them into the manufacturing unit.", "MANUFACTURING_UNIT", "Manufacturing unit"),
      ];
    case "HALLMARKING":
      return [BACK("HALLMARKING_IN", "Receive from hallmarking", "Enter the HUID that came back with each piece.", { asksHuid: true })];
    case "UNDER_REPAIR":
      return [BACK("REPAIR_IN", "Receive from repair", "Puts the repaired pieces back on the shelf.")];
    case "WITH_JOB_WORKER":
      return [BACK("JOBWORK_RECEIPT", "Receive from job worker", "Puts the finished pieces back on the shelf.")];
    case "IN_MANUFACTURING":
      return [BACK("MANUFACTURING_RECEIPT", "Receive from manufacturing", "Puts the finished pieces back on the shelf.")];
    case "RETURNED":
      return [BACK("INSPECT_AVAILABLE", "Inspected — restock", "Puts the returned pieces back on sale."), BACK("INSPECT_DAMAGED", "Inspected — mark damaged", "Writes them down as damaged.")];
    case "DAMAGED":
      return [OUT("REPAIR_OUT", "Send for repair", "Pieces stay ours while at the repairer.", "REPAIR_CENTER", "Repair centre")];
    default:
      return [];
  }
}
