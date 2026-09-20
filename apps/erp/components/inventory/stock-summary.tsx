"use client";

import type { InventoryStatus, StockGroupBy, StockSummaryRow } from "@jewellery/types";
import { Alert, Button, CurrencyDisplay, DataTable, type DataTableColumn, InventoryStatusBadge, formatWeight } from "@jewellery/ui";
import { useStockSummary } from "../../lib/api/inventory-queries";
import { rupees } from "../../lib/inventory/format";

const HEADINGS: Record<StockGroupBy, string> = { location: "Location", sku: "SKU", purity: "Metal & purity", metal: "Metal" };

/**
 * Owned stock rolled up by location / SKU / purity / metal. Sold and melted pieces aren't stock; in-transit
 * pieces count at their destination but not as available. Clicking a row drills into the matching pieces.
 */
export function StockSummaryTable({ groupBy, filters, onDrill }: { groupBy: StockGroupBy; filters: Record<string, unknown>; onDrill: (row: StockSummaryRow) => void }) {
  const summary = useStockSummary({ groupBy, ...filters } as never);

  const columns: DataTableColumn<StockSummaryRow>[] = [
    { id: "label", header: HEADINGS[groupBy], mobileHidden: true, cell: (r) => (<span className="flex flex-col"><span className="font-medium text-foreground">{r.label}</span>{r.sublabel && <span className="text-caption text-muted">{r.sublabel}</span>}</span>) },
    { id: "pieces", header: "Pieces", align: "right", cell: (r) => <span className="tabular">{r.pieces}</span> },
    { id: "available", header: "Available", align: "right", cell: (r) => <span className="tabular">{r.availablePieces}</span> },
    { id: "gross", header: "Gross", align: "right", cell: (r) => <span className="tabular">{formatWeight(r.grossWeight)}</span> },
    { id: "net", header: "Net", align: "right", cell: (r) => <span className="tabular">{formatWeight(r.netWeight)}</span> },
    { id: "fine", header: "Fine", align: "right", cell: (r) => <span className="tabular font-medium">{formatWeight(r.fineWeight)}</span> },
    { id: "cost", header: "Book cost", align: "right", cell: (r) => <CurrencyDisplay amount={rupees(r.cost)} size="sm" /> },
    {
      id: "status",
      header: "Status mix",
      cell: (r) => (
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {(Object.entries(r.byStatus) as [InventoryStatus, number][]).map(([s, n]) => (
            <span key={s} className="inline-flex items-center gap-1 text-caption"><InventoryStatusBadge status={s} className="text-caption" /><span className="tabular text-muted">{n}</span></span>
          ))}
        </span>
      ),
    },
  ];

  if (summary.isError) return <Alert variant="danger" title="Couldn't load the summary"><Button size="sm" variant="secondary" onClick={() => summary.refetch()}>Retry</Button></Alert>;
  const t = summary.data?.totals;
  return (
    <div aria-busy={summary.isFetching} className={summary.isPlaceholderData ? "opacity-60 transition-opacity" : ""}>
      <DataTable
        columns={columns}
        data={summary.data?.rows ?? []}
        getRowId={(r) => r.key}
        isLoading={summary.isLoading}
        onRowClick={onDrill}
        mobileTitle={(r) => r.label}
        emptyTitle="No stock matches"
        emptyDescription="Nothing owned matches these filters."
      />
      {t && (
        <p className="pt-3 text-body-sm text-muted">
          Total: <span className="tabular text-foreground">{t.count}</span> pieces · gross <span className="tabular text-foreground">{formatWeight(t.grossWeight)}</span> · fine <span className="tabular text-foreground">{formatWeight(t.fineWeight)}</span> · book cost <CurrencyDisplay amount={rupees(t.cost)} size="sm" />
        </p>
      )}
    </div>
  );
}
