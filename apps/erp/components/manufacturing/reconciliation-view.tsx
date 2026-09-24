"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@jewellery/ui";
import { useReconciliation } from "../../lib/api/manufacturing";
import { Load, Table, Td, Th, grams } from "./shared";

/**
 * ISSUED / RETURNED / FINISHED / WASTAGE / DISCREPANCY for every production order and job work
 * order that has had material issued — production and job work side by side, since the material
 * accounting is the same question either way. A discrepancy is never buried in a document view:
 * this screen exists specifically to surface it, sorted first, highlighted red.
 */
export function ReconciliationView() {
  const [discrepancyOnly, setDiscrepancyOnly] = React.useState(false);
  const q = useReconciliation(discrepancyOnly || undefined);
  const items = q.data ?? [];
  const discrepancyCount = items.filter((r) => r.hasDiscrepancy).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-muted">{discrepancyCount > 0 ? <span className="font-semibold text-danger">{discrepancyCount} order{discrepancyCount > 1 ? "s" : ""} with an unexplained discrepancy</span> : "No discrepancies outstanding."}</p>
        <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" checked={discrepancyOnly} onChange={(e) => setDiscrepancyOnly(e.target.checked)} data-testid="recon-discrepancy-only" />Discrepancies only</label>
      </div>
      <Load q={q}>
        {items.length === 0 ? <EmptyState icon={<AlertTriangle className="h-8 w-8" />} title={discrepancyOnly ? "No discrepancies" : "Nothing has been issued yet"} description={discrepancyOnly ? "Every reconciled order accounts for its material in full." : "A row appears here once material is issued to a production or job-work order."} /> : (
          <Table testId="reconciliation-table"><thead><tr><Th>Order</Th><Th>Kind</Th><Th>Party / design</Th><Th>Status</Th><Th right>Issued</Th><Th right>Returned</Th><Th right>Finished</Th><Th right>Wastage</Th><Th right>Discrepancy</Th></tr></thead><tbody>
            {items.map((r) => (
              <tr key={`${r.kind}-${r.id}`} className={r.hasDiscrepancy ? "bg-danger-subtle" : undefined} data-testid="reconciliation-row">
                <Td className="font-medium">
                  <Link className="hover:underline" href={r.kind === "PRODUCTION" ? "/production/orders" : "/production/job-work"}>{r.orderNo}</Link>
                </Td>
                <Td>{r.kind === "PRODUCTION" ? "Production" : "Job work"}</Td>
                <Td>{r.party}</Td>
                <Td>{r.status.replace(/_/g, " ").toLowerCase()}</Td>
                <Td right>{grams(r.issuedGrossWeight)}</Td>
                <Td right>{grams(r.returnedGrossWeight)}</Td>
                <Td right>{grams(r.finishedGrossWeight)}</Td>
                <Td right>{grams(r.wastageGrossWeight)}</Td>
                <Td right className={r.hasDiscrepancy ? "font-semibold text-danger" : undefined} data-testid={r.hasDiscrepancy ? "discrepancy-cell" : undefined}>{grams(r.discrepancyGrossWeight)}</Td>
              </tr>
            ))}
          </tbody></Table>
        )}
      </Load>
    </div>
  );
}
