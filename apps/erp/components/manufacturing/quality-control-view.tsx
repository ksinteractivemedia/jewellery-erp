"use client";

import * as React from "react";
import type { ProductionOrder } from "@jewellery/types";
import { PERMISSIONS as P } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { manufacturingApi, useManufacturingAction, useProductionOrders } from "../../lib/api/manufacturing";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, Status, Table, Td, Th, btn, grams, inputCls } from "./shared";

function QcRow({ o, approve, onDone }: { o: ProductionOrder; approve: boolean; onDone: () => void }) {
  const [notes, setNotes] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const passQc = useManufacturingAction(() => manufacturingApi.passQc(o.id, notes || undefined), "QC passed", onDone);
  const failQc = useManufacturingAction(() => manufacturingApi.failQc(o.id, notes), "QC failed", onDone);
  const onErr = { onError: (e: unknown) => setErr(errorMessage(e)) };
  return (
    <tr data-testid="qc-row">
      <Td className="font-medium">{o.productionOrderNo}</Td>
      <Td>{o.designName}</Td>
      <Td right>{grams(o.actualGrossWeight)}</Td>
      <Td right>{grams(o.actualWastage)}</Td>
      <Td><Status s={o.status} />{o.qc?.notes && <span className="block text-caption text-muted">{o.qc.notes}</span>}</Td>
      <Td>
        {o.status === "QC_PENDING" && approve ? (
          <span className="flex flex-wrap items-center gap-2">
            <Field label=""><input className={`${inputCls} w-48`} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} data-testid={`qc-notes-${o.productionOrderNo}`} /></Field>
            <button className={btn("primary")} disabled={passQc.isPending} onClick={() => passQc.mutate(undefined, onErr)} data-testid={`qc-pass-${o.productionOrderNo}`}>Pass</button>
            <button className={btn("danger")} disabled={failQc.isPending || !notes.trim()} onClick={() => failQc.mutate(undefined, onErr)} data-testid={`qc-fail-${o.productionOrderNo}`}>Fail</button>
            {err && <span className="text-caption text-danger" role="alert">{err}</span>}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </Td>
    </tr>
  );
}

/** Everything waiting on a QC decision, or already decided — pass/fail right from the queue, no need to open the order. */
export function QualityControlView() {
  const { can } = useAuth();
  const [showAll, setShowAll] = React.useState(false);
  const q = useProductionOrders(showAll ? "QC_PENDING,QC_PASSED,QC_FAILED" : "QC_PENDING");
  const items = q.data ?? [];
  const approve = can(P.PRODUCTION_APPROVE);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} data-testid="qc-show-all" />Show already-decided orders too</label>
      <Load q={q}>
        {items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted">Nothing waiting on QC.</p> : (
          <Table testId="qc-table"><thead><tr><Th>MO</Th><Th>Design</Th><Th right>Actual weight</Th><Th right>Wastage</Th><Th>Status</Th><Th>Decision</Th></tr></thead><tbody>
            {items.map((o) => <QcRow key={o.id + o.status} o={o} approve={approve} onDone={() => q.refetch()} />)}
          </tbody></Table>
        )}
      </Load>
    </div>
  );
}
