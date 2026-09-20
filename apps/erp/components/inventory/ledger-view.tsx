"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import type { LedgerRow, MovementType } from "@jewellery/types";
import { MOVEMENT_TYPES, ledgerQuerySchema, type LedgerQueryInput } from "@jewellery/validation";
import { Alert, Badge, Button, Combobox, DataTable, type DataTableColumn, EmptyState, FilterBar, InventoryStatusBadge, MultiSelect, PageHeader, Pagination, formatWeight } from "@jewellery/ui";
import { useInventoryMeta, useLedger } from "../../lib/api/inventory-queries";
import { MOVEMENT_LABELS, shortId } from "../../lib/inventory/format";
import { useUrlParams } from "../../lib/url-params";

const FILTER_KEYS = ["itemId", "movementType", "locationId", "from", "to", "referenceId"] as const;
const DEFAULTS = { order: "desc", page: 1, pageSize: 50 } as const;
const parse = (raw: Record<string, string>): LedgerQueryInput => {
  const p = ledgerQuerySchema.safeParse(raw);
  return p.success ? (p.data as LedgerQueryInput) : { ...DEFAULTS };
};
const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const signed = (n: number) => (n === 0 ? "" : `${n > 0 ? "+" : "−"}${formatWeight(Math.abs(n))}`);
const dayStart = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const dayEnd = (d: string) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);

/** The whole stock ledger: every movement of every piece, append-only. Filter by movement, location, date, or one piece. */
export function LedgerView() {
  const router = useRouter();
  const { params, setParams, clearFilters } = useUrlParams<LedgerQueryInput>({ parse, defaults: DEFAULTS, filterKeys: FILTER_KEYS });
  const meta = useInventoryMeta();
  const q = { ...params, movementType: Array.isArray(params.movementType) ? (params.movementType.join(",") as never) : params.movementType };
  const ledger = useLedger(q as never);
  const types = (Array.isArray(params.movementType) ? params.movementType : []) as MovementType[];
  const locations = (meta.data?.locations ?? []).map((l) => ({ value: l.id, label: l.name }));
  const data = ledger.data;
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const chips = [
    types.length > 0 && { id: "movementType", label: `Movement: ${types.map((t) => MOVEMENT_LABELS[t]).join(", ")}` },
    params.locationId && { id: "locationId", label: `Location: ${locations.find((l) => l.value === params.locationId)?.label ?? "…"}` },
    params.itemId && { id: "itemId", label: "One piece" },
    params.referenceId && { id: "referenceId", label: `Reference …${shortId(params.referenceId)}` },
    params.from && { id: "from", label: `From ${new Date(params.from).toLocaleDateString("en-IN")}` },
    params.to && { id: "to", label: `To ${new Date(params.to).toLocaleDateString("en-IN")}` },
  ].filter(Boolean) as { id: string; label: string }[];

  const columns: DataTableColumn<LedgerRow>[] = [
    { id: "when", header: "When", cell: (r) => <span className="whitespace-nowrap text-muted">{when.format(new Date(r.createdAt))}</span> },
    { id: "item", header: "Piece", mobileHidden: true, cell: (r) => (<span className="flex flex-col"><Link href={`/inventory/stock/${r.itemId}`} onClick={(e) => e.stopPropagation()} className="font-mono text-body-sm font-medium hover:text-primary-active hover:underline">{r.itemCode}</Link><span className="text-caption text-muted">#{r.sequence}{r.productName ? ` · ${r.productName}` : ""}</span></span>) },
    { id: "movement", header: "Movement", cell: (r) => <Badge variant="outline">{MOVEMENT_LABELS[r.movementType]}</Badge> },
    { id: "status", header: "Status", cell: (r) => (<span className="flex flex-wrap items-center gap-1">{r.fromStatus && <><InventoryStatusBadge status={r.fromStatus} /><span aria-hidden="true">→</span></>}<InventoryStatusBadge status={r.toStatus} /></span>) },
    { id: "where", header: "Location", cell: (r) => (r.sourceLocation && r.destinationLocation && r.sourceLocation.id !== r.destinationLocation.id ? `${r.sourceLocation.name} → ${r.destinationLocation.name}` : (r.destinationLocation?.name ?? "—")) },
    { id: "gross", header: "Δ Gross", align: "right", cell: (r) => <span className="tabular">{signed(r.grossWeight) || <span className="text-muted">—</span>}</span> },
    { id: "fine", header: "Δ Fine", align: "right", cell: (r) => <span className="tabular">{signed(r.fineWeight) || <span className="text-muted">—</span>}</span> },
    { id: "balance", header: "Balance", align: "right", cell: (r) => <span className="tabular">{formatWeight(r.balanceAfter.grossWeight)}</span> },
    { id: "by", header: "By", cell: (r) => r.performedBy.name },
    { id: "why", header: "Reason / reference", cell: (r) => (<span className="text-body-sm text-muted">{r.reason ?? (r.referenceId ? `${r.referenceType.replace(/_/g, " ").toLowerCase()} …${shortId(r.referenceId)}` : "—")}</span>) },
  ];

  return (
    <>
      <PageHeader title="Stock ledger" description="Every movement of every piece. Append-only: entries are never edited or deleted — a mistake is corrected by a new entry." breadcrumb={[{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Ledger" }]} />
      <div className="sticky -top-4 z-20 -mx-4 mb-3 border-b border-border-subtle bg-background/95 px-4 pb-3 pt-1 backdrop-blur md:-top-6 md:-mx-6 md:px-6">
        <FilterBar
          controls={
            <>
              <div className="w-full md:w-64"><MultiSelect aria-label="Movement type" placeholder="Any movement" searchPlaceholder="Search movements…" options={MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_LABELS[t] }))} value={types} onValueChange={(v) => setParams({ movementType: v.length ? v.join(",") : undefined })} /></div>
              <div className="w-full md:w-44"><Combobox aria-label="Location" placeholder="Any location" searchPlaceholder="Search locations…" options={[{ value: "", label: "Any location" }, ...locations]} value={params.locationId ?? ""} onValueChange={(v) => setParams({ locationId: v || undefined })} /></div>
              <label className="flex items-center gap-1.5 text-body-sm text-muted">From<input type="date" aria-label="From date" value={params.from ? new Date(params.from).toLocaleDateString("en-CA") : ""} onChange={(e) => setParams({ from: dayStart(e.target.value) })} className="h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-foreground" /></label>
              <label className="flex items-center gap-1.5 text-body-sm text-muted">To<input type="date" aria-label="To date" value={params.to ? new Date(params.to).toLocaleDateString("en-CA") : ""} onChange={(e) => setParams({ to: dayEnd(e.target.value) })} className="h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-foreground" /></label>
            </>
          }
          activeFilters={chips}
          onRemoveFilter={(id) => setParams({ [id]: undefined })}
          onClearAll={clearFilters}
        />
      </div>
      {ledger.isError ? (
        <Alert variant="danger" title="Couldn't load the ledger"><Button size="sm" variant="secondary" onClick={() => ledger.refetch()}>Retry</Button></Alert>
      ) : !ledger.isLoading && (data?.rows.length ?? 0) === 0 ? (
        <EmptyState icon={<BookOpen className="h-8 w-8" />} title="No movements match" description="Try widening the dates or removing a filter." action={chips.length ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined} />
      ) : (
        <div aria-busy={ledger.isFetching} className={ledger.isPlaceholderData ? "opacity-60 transition-opacity" : ""}>
          <DataTable columns={columns} data={data?.rows ?? []} getRowId={(r) => r.id} isLoading={ledger.isLoading} onRowClick={(r) => router.push(`/inventory/stock/${r.itemId}`)} mobileTitle={(r) => (<span className="flex flex-col"><span className="font-mono">{r.itemCode}</span><span className="text-caption font-normal text-muted">#{r.sequence}</span></span>)} />
          {data && <Pagination className="pt-4" page={data.page} pageCount={pageCount} onPageChange={(page) => setParams({ page })} summary={`${data.total} entr${data.total === 1 ? "y" : "ies"}`} />}
        </div>
      )}
    </>
  );
}
