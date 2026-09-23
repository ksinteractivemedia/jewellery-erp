"use client";

import * as React from "react";
import type { PurchaseOrder } from "@jewellery/types";
import { useInventoryMeta } from "../../lib/api/inventory-queries";
import { purchasingApi, useGoodsReceipts, usePurchasingAction } from "../../lib/api/purchasing";
import { errorMessage } from "../../lib/api/queries";
import { Field, Table, Td, Th, WEIGHT_TRACKED, btn, day, grams, inputCls } from "./shared";

interface ReceiptLineDraft {
  include: boolean;
  quantity: string;
  grossWeight: string;
  expectedGrossWeight: string;
  purity: string;
  locationId: string;
  discrepancyNote: string;
}

/** Receives whatever is outstanding on the purchase order — one row per line still open, each posting only what is entered. */
export function ReceiveGoodsForm({ po, onDone, onCancel }: { po: PurchaseOrder; onDone: () => void; onCancel: () => void }) {
  const meta = useInventoryMeta();
  const outstandingIdx = po.lines.map((l, i) => ({ l, i })).filter(({ l }) => (WEIGHT_TRACKED.has(l.purchaseType) ? l.receivedGrossWeight < (l.grossWeight ?? 0) : l.receivedQuantity < l.quantity));
  const [drafts, setDrafts] = React.useState<Record<number, ReceiptLineDraft>>(() =>
    Object.fromEntries(outstandingIdx.map(({ i }) => [i, { include: false, quantity: "1", grossWeight: "", expectedGrossWeight: "", purity: "", locationId: po.deliveryLocation.id, discrepancyNote: "" }]))
  );
  const [err, setErr] = React.useState<string>();
  const receive = usePurchasingAction((body: object) => purchasingApi.receiveGoods(po.id, body), "Goods received", onDone);

  const lines = outstandingIdx
    .filter(({ i }) => drafts[i]?.include)
    .map(({ l, i }) => {
      const d = drafts[i]!;
      const weightTracked = WEIGHT_TRACKED.has(l.purchaseType);
      const line: Record<string, unknown> = { purchaseOrderLineIndex: i, quantity: Number(d.quantity) || 1, locationId: d.locationId };
      if (weightTracked) {
        line.grossWeight = Number(d.grossWeight) || 0;
        if (d.expectedGrossWeight.trim()) line.expectedGrossWeight = Number(d.expectedGrossWeight);
      }
      if (d.purity.trim()) line.purity = d.purity.trim();
      if (d.discrepancyNote.trim()) line.discrepancyNote = d.discrepancyNote.trim();
      return line;
    });
  const canSubmit = lines.length > 0 && lines.every((l) => l.locationId && (!("grossWeight" in l) || (l.grossWeight as number) > 0));
  const receivedDate = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary bg-surface p-4" data-testid="receive-form">
      <h4 className="font-semibold">Receive goods against {po.poNo}</h4>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="receive-error">{err}</p>}
      {outstandingIdx.length === 0 ? <p className="text-muted">Nothing outstanding.</p> : outstandingIdx.map(({ l, i }) => {
        const d = drafts[i]!;
        const weightTracked = WEIGHT_TRACKED.has(l.purchaseType);
        const outstandingQty = weightTracked ? undefined : l.quantity - l.receivedQuantity;
        const outstandingWt = weightTracked ? (l.grossWeight ?? 0) - l.receivedGrossWeight : undefined;
        const set = (patch: Partial<ReceiptLineDraft>) => setDrafts((ds) => ({ ...ds, [i]: { ...ds[i]!, ...patch } }));
        return (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-border-subtle p-3 sm:grid-cols-4 lg:grid-cols-7" data-testid="receive-line">
            <label className="flex items-center gap-2 text-body-sm sm:col-span-4 lg:col-span-7"><input type="checkbox" checked={d.include} onChange={(e) => set({ include: e.target.checked })} data-testid="receive-line-include" /><span className="font-medium">{l.description}</span><span className="text-muted">— outstanding {weightTracked ? grams(outstandingWt) : `${outstandingQty} pcs`}</span></label>
            {d.include && (
              <>
                {!weightTracked && <Field label="Quantity"><input className={inputCls} inputMode="numeric" value={d.quantity} onChange={(e) => set({ quantity: e.target.value })} data-testid="receive-quantity" /></Field>}
                {weightTracked && (
                  <>
                    <Field label="Scale weight (g)"><input className={inputCls} inputMode="decimal" value={d.grossWeight} onChange={(e) => set({ grossWeight: e.target.value })} data-testid="receive-gross-weight" /></Field>
                    <Field label="Delivery note said (g, optional)"><input className={inputCls} inputMode="decimal" value={d.expectedGrossWeight} onChange={(e) => set({ expectedGrossWeight: e.target.value })} data-testid="receive-expected-weight" /></Field>
                    <Field label="Purity (if different)"><input className={inputCls} value={d.purity} onChange={(e) => set({ purity: e.target.value })} placeholder={l.purity} data-testid="receive-purity" /></Field>
                  </>
                )}
                <Field label="Into location"><select className={inputCls} value={d.locationId} onChange={(e) => set({ locationId: e.target.value })} data-testid="receive-location">{(meta.data?.locations ?? []).map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}</select></Field>
                <Field label="Discrepancy note (if weight is off)"><input className={inputCls} value={d.discrepancyNote} onChange={(e) => set({ discrepancyNote: e.target.value })} data-testid="receive-discrepancy-note" /></Field>
              </>
            )}
          </div>
        );
      })}
      <div className="flex gap-2">
        <button className={btn("primary")} disabled={!canSubmit || receive.isPending} onClick={() => receive.mutate({ receivedDate, lines }, { onError: (e) => setErr(errorMessage(e)) })} data-testid="receive-go">Post receipt</button>
        <button className={btn()} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function GoodsReceiptsForOrder({ poId }: { poId: string }) {
  const q = useGoodsReceipts();
  const receipts = (q.data ?? []).filter((g) => g.purchaseOrderId === poId);
  if (q.isLoading || receipts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-semibold">Goods receipts</h4>
      <Table testId="po-receipts"><thead><tr><Th>GRN</Th><Th>Received</Th><Th right>Lines</Th><Th>By</Th></tr></thead><tbody>
        {receipts.map((g) => <tr key={g.id} data-testid="po-receipt-row"><Td className="font-medium">{g.grnNo}</Td><Td>{day(g.receivedDate)}</Td><Td right>{g.lines.length}</Td><Td>{g.receivedByName ?? "—"}{g.lines.some((l) => l.hasWeightDiscrepancy) && <span className="ml-2 text-caption text-warning">discrepancy noted</span>}</Td></tr>)}
      </tbody></Table>
    </div>
  );
}
