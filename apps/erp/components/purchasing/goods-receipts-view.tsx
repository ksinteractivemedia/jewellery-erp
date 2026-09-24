"use client";

import * as React from "react";
import { PackageCheck } from "lucide-react";
import { EmptyState } from "@jewellery/ui";
import { useGoodsReceipts } from "../../lib/api/purchasing";
import { Load, Table, Td, Th, day, grams, money } from "./shared";

export function GoodsReceiptsView() {
  const q = useGoodsReceipts();
  const [sel, setSel] = React.useState<string>();
  const items = q.data ?? [];
  const current = items.find((g) => g.id === sel);
  return (
    <div className="flex flex-col gap-4">
      <Load q={q}>
        {items.length === 0 ? <EmptyState icon={<PackageCheck className="h-8 w-8" />} title="No goods have been received yet" description="A receipt appears here once a purchase order is received against." /> : (
          <Table testId="grn-table"><thead><tr><Th>GRN</Th><Th>PO</Th><Th>Supplier</Th><Th>Received</Th><Th right>Lines</Th><Th>By</Th></tr></thead><tbody>
            {items.map((g) => (
              <tr key={g.id} className={`cursor-pointer hover:bg-surface-sunken ${sel === g.id ? "bg-surface-sunken" : ""}`} onClick={() => setSel(g.id)} data-testid="grn-row">
                <Td className="font-medium">{g.grnNo}</Td><Td>{g.poNo}</Td><Td>{g.supplier.name}</Td><Td>{day(g.receivedDate)}</Td><Td right>{g.lines.length}</Td>
                <Td>{g.receivedByName ?? "—"}{g.lines.some((l) => l.hasWeightDiscrepancy) && <span className="ml-2 text-caption text-warning">discrepancy</span>}</Td>
              </tr>
            ))}
          </tbody></Table>
        )}
      </Load>
      {current && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" data-testid="grn-detail">
          <h3 className="text-h4 font-semibold">{current.grnNo} <span className="font-normal text-muted">· {current.poNo} · {current.supplier.name}</span></h3>
          <Table><thead><tr><Th>Description</Th><Th right>Qty</Th><Th right>Weight</Th><Th right>Value</Th><Th>Discrepancy</Th></tr></thead><tbody>
            {current.lines.map((l, i) => (
              <tr key={i}>
                <Td>{l.description}{l.lotNumber && <span className="block text-caption text-muted">Lot {l.lotNumber}</span>}</Td>
                <Td right>{l.quantity}</Td>
                <Td right>{grams(l.grossWeight)}{l.expectedGrossWeight !== undefined && <span className="block text-caption text-muted">expected {grams(l.expectedGrossWeight)}</span>}</Td>
                <Td right>{money(l.value)}</Td>
                <Td>{l.hasWeightDiscrepancy ? <span className="text-warning">{l.variancePercent}% off — {l.discrepancyNote}</span> : "—"}</Td>
              </tr>
            ))}
          </tbody></Table>
          {current.notes && <p className="text-body-sm">Notes: {current.notes}</p>}
        </div>
      )}
    </div>
  );
}
