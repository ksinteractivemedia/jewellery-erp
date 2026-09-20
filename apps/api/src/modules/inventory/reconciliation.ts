import type { InventoryLedgerEntry } from "@jewellery/types";
import { InventoryItemModel } from "./inventory-item.model";
import { InventoryLedgerModel } from "./inventory-ledger.model";
import { toDTOList } from "../../shared/to-dto";
import { roundWeight } from "./weight-calculations";

export interface ReplayResult {
  problems: string[];
  sequence: number;
  status?: string;
  locationId?: string;
  balance?: InventoryLedgerEntry["balanceAfter"];
}

/**
 * Pure: replays one item's ledger (any order in) and checks it is internally consistent — sequence
 * 1..n with no gaps, each entry starting from where the last one ended, balance = previous balance +
 * deltas — returning the state the ledger says the item is in. This is what makes "reconstruct
 * inventory history" a guarantee rather than a hope.
 */
export function replayLedger(entries: InventoryLedgerEntry[]): ReplayResult {
  const sorted = [...entries].sort((a, b) => a.sequence - b.sequence);
  const problems: string[] = [];
  let prev: InventoryLedgerEntry | undefined;
  for (const [i, e] of sorted.entries()) {
    if (e.sequence !== i + 1) problems.push(`expected sequence ${i + 1} but found ${e.sequence}`);
    if (prev) {
      if (e.fromStatus !== prev.toStatus) problems.push(`#${e.sequence} starts from ${e.fromStatus} but #${prev.sequence} ended at ${prev.toStatus}`);
      const b = prev.balanceAfter;
      const expected = {
        quantity: b.quantity + e.quantity,
        grossWeight: roundWeight(b.grossWeight + e.grossWeight),
        netWeight: roundWeight(b.netWeight + e.netWeight),
        fineWeight: roundWeight(b.fineWeight + e.fineWeight),
      };
      for (const k of ["quantity", "grossWeight", "netWeight", "fineWeight"] as const) {
        if (Math.abs(expected[k] - e.balanceAfter[k]) > 0.0005) problems.push(`#${e.sequence} ${k}: previous balance + delta = ${expected[k]}, entry says ${e.balanceAfter[k]}`);
      }
    } else if (e.fromStatus !== undefined) {
      problems.push("the first entry should not have a previous status");
    }
    prev = e;
  }
  return { problems, sequence: sorted.length, status: prev?.toStatus, locationId: prev?.destinationLocationId, balance: prev?.balanceAfter };
}

export interface ReconcileResult {
  itemId: string;
  itemCode: string;
  ok: boolean;
  problems: string[];
}

/** Checks the item's cached status/location/weights/quantity/sequence against what its ledger replays to. */
export async function reconcileItem(itemId: string): Promise<ReconcileResult> {
  const item = await InventoryItemModel.findById(itemId).lean();
  if (!item) return { itemId, itemCode: "?", ok: false, problems: ["item not found"] };
  const entries = toDTOList<InventoryLedgerEntry>(await InventoryLedgerModel.find({ itemId }).sort({ sequence: 1 }));
  const replay = replayLedger(entries);
  const problems = [...replay.problems];
  if (replay.sequence !== item.ledgerSeq) problems.push(`item says ${item.ledgerSeq} ledger entries, ledger has ${replay.sequence}`);
  if (replay.status && replay.status !== item.status) problems.push(`item status ${item.status} but ledger ends at ${replay.status}`);
  if (replay.locationId && replay.locationId !== String(item.locationId)) problems.push(`item location differs from the ledger's last destination`);
  if (replay.balance) {
    const b = replay.balance;
    for (const k of ["quantity", "grossWeight", "stoneWeight", "netWeight", "fineWeight"] as const) {
      if (Math.abs((item[k] as number) - b[k]) > 0.0005) problems.push(`${k}: item has ${item[k]}, ledger says ${b[k]}`);
    }
  }
  return { itemId, itemCode: item.itemCode, ok: problems.length === 0, problems };
}

/** Every item that has a ledger. For a scheduled integrity job (architecture.md risk #3). */
export async function reconcileAll(): Promise<{ checked: number; mismatches: ReconcileResult[] }> {
  const ids = (await InventoryItemModel.find({ ledgerSeq: { $gt: 0 } }).select("_id").lean()).map((i) => String(i._id));
  const mismatches: ReconcileResult[] = [];
  for (const id of ids) {
    const r = await reconcileItem(id);
    if (!r.ok) mismatches.push(r);
  }
  return { checked: ids.length, mismatches };
}
