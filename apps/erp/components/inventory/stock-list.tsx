"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Filter, Package, Plus } from "lucide-react";
import { toast } from "@jewellery/ui";
import { PERMISSIONS, type InventoryListItem, type InventoryStatus, type StockSummaryRow } from "@jewellery/types";
import {
  Alert,
  BulkActionBar,
  Button,
  Combobox,
  CurrencyDisplay,
  DataTable,
  type DataTableColumn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  FilterBar,
  FilterDrawer,
  MultiSelect,
  PageHeader,
  Pagination,
  PurityBadge,
  ScanInput,
  SearchInput,
  Tabs,
  TabsList,
  TabsTrigger,
  formatDate,
  formatWeight,
} from "@jewellery/ui";
import { inventoryApi } from "../../lib/api/inventory";
import { useInventoryList, useInventoryMeta } from "../../lib/api/inventory-queries";
import { useAuth } from "../../lib/auth/auth-context";
import { LOCATION_TYPE_LABELS, rupees } from "../../lib/inventory/format";
import { STOCK_VIEWS, toListQuery, useStockListParams, type StockView } from "../../lib/inventory/list-params";
import { operationsFor, type OperationSpec } from "../../lib/inventory/operations";
import { useScanner } from "../../lib/inventory/scanner";
import { FilterSelect } from "../catalog/filter-select";
import { Grams, ItemHuidCell, ItemLocationCell, ItemStatusCell } from "./item-cells";
import { MoveDialog } from "./move-dialog";
import { QuickView } from "./quick-view";
import { ReserveDialog } from "./reserve-dialog";
import { StockSummaryTable } from "./stock-summary";

const STATUS_OPTIONS: { value: InventoryStatus; label: string }[] = [
  { value: "AVAILABLE", label: "Available" },
  { value: "RESERVED", label: "Reserved" },
  { value: "SOLD", label: "Sold" },
  { value: "RETURNED", label: "Returned" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "UNDER_REPAIR", label: "Under repair" },
  { value: "IN_MANUFACTURING", label: "In manufacturing" },
  { value: "WITH_JOB_WORKER", label: "With job worker" },
  { value: "IN_TRANSIT", label: "In transit" },
  { value: "HALLMARKING", label: "Hallmarking" },
  { value: "SCRAP", label: "Scrap" },
  { value: "MELTING", label: "Melting" },
];
const VIEW_LABELS: Record<StockView, string> = { items: "Pieces", location: "By location", sku: "By SKU", purity: "By purity", metal: "By metal" };
const SORT_BY_COLUMN: Record<string, string> = { item: "itemCode", gross: "grossWeight", net: "netWeight", fine: "fineWeight", cost: "cost", status: "status", updated: "updatedAt" };
const columnForSort = (sort: string) => Object.entries(SORT_BY_COLUMN).find(([, v]) => v === sort)?.[0] ?? "updated";

export function StockList() {
  const router = useRouter();
  const { can } = useAuth();
  const canCreate = can(PERMISSIONS.INVENTORY_CREATE);
  const canMove = can(PERMISSIONS.INVENTORY_TRANSFER);
  const canReserve = can(PERMISSIONS.SALES_CREATE) || canMove;
  const { params, setParams, clearFilters } = useStockListParams();
  const meta = useInventoryMeta();
  const inItems = params.view === "items";
  const query = toListQuery(params);
  const list = useInventoryList(query);

  const [search, setSearch] = React.useState(params.q ?? "");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [quick, setQuick] = React.useState<InventoryListItem | null>(null);
  const [op, setOp] = React.useState<OperationSpec | null>(null);
  const [reserving, setReserving] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => search !== (params.q ?? "") && setParams({ q: search.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => setSearch(params.q ?? ""), [params.q]);
  const viewKey = JSON.stringify({ ...params, sort: undefined, order: undefined });
  React.useEffect(() => setSelected(new Set()), [viewKey]);

  // ---- scanning: a scanner anywhere on the page (or the scan box) opens the piece -------------
  const resolve = React.useCallback(async (code: string) => {
    setScanning(true);
    try {
      const res = await inventoryApi.scan(code);
      if (res.item) setQuick(res.item);
      else toast({ title: "No piece found", description: `Nothing matches “${res.code}”.`, variant: "danger" });
    } catch (e) {
      toast({ title: "Scan failed", description: e instanceof Error ? e.message : "Try again", variant: "danger" });
    } finally {
      setScanning(false);
    }
  }, []);
  useScanner(resolve, !quick);

  const data = list.data;
  const rows = data?.items ?? [];
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const picked = rows.filter((r) => selected.has(r.id));
  const statuses = new Set(picked.map((r) => r.status));
  const commonStatus = statuses.size === 1 ? [...statuses][0]! : undefined;
  const ops = commonStatus ? operationsFor(commonStatus) : [];
  // Only single pieces are held for orders — a batch of raw material is drawn down, not reserved. (The API enforces the same.)
  const canHold = commonStatus === "AVAILABLE" && canReserve && picked.every((p) => p.serialization === "UNIT");

  const locationOptions = (meta.data?.locations ?? []).map((l) => ({ value: l.id, label: l.name, description: LOCATION_TYPE_LABELS[l.type] }));
  const metalOptions = (meta.data?.metals ?? []).map((m) => ({ value: m.id, label: m.name }));
  const purityOptions = (meta.data?.usedPurities ?? []).map((p) => ({ value: p, label: p }));
  const statusList = (Array.isArray(params.status) ? params.status : []) as InventoryStatus[];

  const chips = [
    params.q && { id: "q", label: `“${params.q}”` },
    statusList.length > 0 && { id: "status", label: `Status: ${statusList.map((s) => STATUS_OPTIONS.find((o) => o.value === s)?.label).join(", ")}` },
    params.locationId && { id: "locationId", label: `Location: ${locationOptions.find((o) => o.value === params.locationId)?.label ?? "…"}` },
    params.metalId && { id: "metalId", label: `Metal: ${metalOptions.find((o) => o.value === params.metalId)?.label ?? "…"}` },
    params.purity && { id: "purity", label: `Purity: ${params.purity}` },
    params.hallmarkStatus && { id: "hallmarkStatus", label: `Hallmark: ${params.hallmarkStatus.toLowerCase()}` },
    params.availableForSale !== undefined && { id: "availableForSale", label: params.availableForSale ? "Available for sale" : "Not for sale" },
    params.productId && { id: "productId", label: "One product" },
  ].filter(Boolean) as { id: string; label: string }[];
  const clearAll = () => { clearFilters(); setSearch(""); };

  const filterControls = (
    <>
      <div className="w-full md:w-48"><MultiSelect aria-label="Status" placeholder="Any status" searchPlaceholder="Search statuses…" options={STATUS_OPTIONS} value={statusList} onValueChange={(v) => setParams({ status: v.length ? v.join(",") : undefined })} /></div>
      <div className="w-full md:w-44"><Combobox aria-label="Location" placeholder="Any location" searchPlaceholder="Search locations…" options={[{ value: "", label: "Any location" }, ...locationOptions]} value={params.locationId ?? ""} onValueChange={(v) => setParams({ locationId: v || undefined })} /></div>
      <FilterSelect label="Metal" allLabel="Any metal" value={params.metalId} onChange={(v) => setParams({ metalId: v })} options={metalOptions} />
      <FilterSelect label="Purity" allLabel="Any purity" value={params.purity} onChange={(v) => setParams({ purity: v })} options={purityOptions} className="w-full md:w-32" />
      <FilterSelect label="Hallmark" allLabel="Any hallmark" value={params.hallmarkStatus} onChange={(v) => setParams({ hallmarkStatus: v })} options={[{ value: "HALLMARKED", label: "Hallmarked" }, { value: "PENDING", label: "Pending" }, { value: "NOT_APPLICABLE", label: "Not applicable" }]} />
      <FilterSelect label="Availability" allLabel="Any availability" value={params.availableForSale === undefined ? undefined : params.availableForSale ? "yes" : "no"} onChange={(v) => setParams({ availableForSale: v === undefined ? undefined : v === "yes" })} options={[{ value: "yes", label: "Available for sale" }, { value: "no", label: "Not for sale" }]} className="w-full md:w-44" />
    </>
  );

  const columns: DataTableColumn<InventoryListItem>[] = [
    { id: "item", header: "Piece", sortable: true, mobileHidden: true, className: "max-w-[11rem]", cell: (r) => (
      <span className="flex min-w-0 flex-col">
        <Link href={`/inventory/stock/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-body-sm font-medium text-foreground hover:text-primary-active hover:underline">{r.itemCode}</Link>
        <span className="truncate text-caption text-muted">{r.product?.name ?? "No product"}{r.variantSku ? ` · ${r.variantSku}` : ""}</span>
      </span>
    ) },
    { id: "metal", header: "Metal", cell: (r) => <span className="inline-flex items-center gap-1.5">{r.metal.name}<PurityBadge purity={r.purity} /></span> },
    { id: "gross", header: "Gross", sortable: true, align: "right", cell: (r) => <Grams value={r.grossWeight} /> },
    { id: "stone", header: "Stone", align: "right", className: "hidden 2xl:table-cell", cell: (r) => <Grams value={r.stoneWeight} /> },
    { id: "net", header: "Net", sortable: true, align: "right", cell: (r) => <Grams value={r.netWeight} /> },
    { id: "fine", header: "Fine", sortable: true, align: "right", cell: (r) => <span className="tabular font-medium">{formatWeight(r.fineWeight)}</span> },
    { id: "huid", header: "HUID", cell: (r) => <ItemHuidCell item={r} /> },
    { id: "location", header: "Location", cell: (r) => <ItemLocationCell location={r.location} /> },
    { id: "status", header: "Status", sortable: true, cell: (r) => <ItemStatusCell item={r} /> },
    { id: "cost", header: "Cost", sortable: true, align: "right", className: "hidden 2xl:table-cell", cell: (r) => <CurrencyDisplay amount={rupees(r.cost)} size="sm" /> },
    { id: "updated", header: "Updated", sortable: true, className: "hidden 2xl:table-cell", cell: (r) => <span className="text-muted">{formatDate(r.updatedAt)}</span> },
  ];

  const drill = (row: StockSummaryRow) => {
    const [a, b] = row.key.split(":");
    const patch: Record<string, string | undefined> = { view: undefined };
    if (params.view === "location") patch.locationId = row.key;
    else if (params.view === "metal") patch.metalId = row.key;
    else if (params.view === "purity") { patch.metalId = a; patch.purity = b; }
    else if (params.view === "sku") patch.productId = a === "none" ? undefined : a;
    setParams(patch);
  };
  const summaryFilters = { locationId: params.locationId, metalId: params.metalId, purity: params.purity, status: statusList.length ? statusList : undefined, type: params.type };

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Physical pieces — where each one is, what state it's in, and what it weighs. Every change is a ledger entry."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Stock" }]}
        actions={canCreate && <Button asChild><Link href="/inventory/stock/new"><Plus className="h-4 w-4" /> Receive stock</Link></Button>}
      />

      {/* Sticky toolbar: stays put while the table scrolls beneath it. */}
      <div className="sticky -top-4 z-20 -mx-4 mb-3 border-b border-border-subtle bg-background/95 px-4 pb-3 pt-3 backdrop-blur md:-top-6 md:-mx-6 md:px-6" data-testid="inventory-toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[14rem] flex-1 md:max-w-sm">
            <SearchInput aria-label="Search inventory" placeholder="Search code, HUID, barcode, SKU, name…" value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} />
          </div>
          <div className="w-44"><ScanInput aria-label="Scan a piece" loading={scanning} onScan={resolve} placeholder="Scan a piece" /></div>
          <Button variant="secondary" className="md:hidden" onClick={() => setFiltersOpen(true)}><Filter className="h-4 w-4" /> Filters{chips.length > 0 && ` (${chips.length})`}</Button>
          {inItems && (
            <label className="ml-auto flex items-center gap-2 text-body-sm text-muted">
              Sort
              <FilterSelect label="Sort pieces" allLabel="Recently updated" value={params.sort === "updatedAt" && params.order === "desc" ? undefined : `${params.sort}:${params.order}`} onChange={(v) => { const [sort = "updatedAt", order = "desc"] = (v ?? "updatedAt:desc").split(":"); setParams({ sort, order }); }}
                options={[{ value: "itemCode:asc", label: "Code A–Z" }, { value: "grossWeight:desc", label: "Heaviest first" }, { value: "grossWeight:asc", label: "Lightest first" }, { value: "fineWeight:desc", label: "Most fine metal" }, { value: "cost:desc", label: "Highest cost" }, { value: "createdAt:desc", label: "Newest first" }]} className="w-44" />
            </label>
          )}
        </div>
        <div className="hidden pt-2 md:block"><FilterBar controls={filterControls} activeFilters={chips} onRemoveFilter={(id) => setParams({ [id]: undefined })} onClearAll={clearAll} /></div>
        {chips.length > 0 && <div className="pt-2 md:hidden"><FilterBar activeFilters={chips} onRemoveFilter={(id) => setParams({ [id]: undefined })} onClearAll={clearAll} /></div>}
      </div>
      <FilterDrawer open={filtersOpen} onOpenChange={setFiltersOpen} onApply={() => setFiltersOpen(false)} onClear={clearAll} resultCount={data?.total}>
        <div className="flex flex-col gap-3">{filterControls}</div>
      </FilterDrawer>

      <Tabs value={params.view} onValueChange={(v) => setParams({ view: v })}>
        <TabsList className="mb-4 w-full overflow-x-auto" aria-label="Stock views">
          {STOCK_VIEWS.map((v) => <TabsTrigger key={v} value={v}>{VIEW_LABELS[v]}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {!inItems ? (
        <StockSummaryTable groupBy={params.view as never} filters={summaryFilters} onDrill={drill} />
      ) : list.isError ? (
        <Alert variant="danger" title="Couldn't load inventory"><div className="flex items-center justify-between gap-3"><span>{list.error instanceof Error ? list.error.message : "Try again."}</span><Button size="sm" variant="secondary" onClick={() => list.refetch()}>Retry</Button></div></Alert>
      ) : !list.isLoading && rows.length === 0 ? (
        <EmptyState icon={<Package className="h-8 w-8" />} title={chips.length ? "No pieces match these filters" : "No inventory yet"} description={chips.length ? "Try removing a filter or scanning a code." : "Receive stock to create the first piece."} action={chips.length ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button> : undefined} />
      ) : (
        <div aria-busy={list.isFetching} className={list.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data && (
            <dl className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-body-sm" aria-label="Totals for the current filters">
              <div className="flex gap-1.5"><dt className="text-muted">Pieces</dt><dd className="tabular font-medium">{data.totals.count}</dd></div>
              <div className="flex gap-1.5"><dt className="text-muted">Gross</dt><dd className="tabular font-medium">{formatWeight(data.totals.grossWeight)}</dd></div>
              <div className="flex gap-1.5"><dt className="text-muted">Net</dt><dd className="tabular font-medium">{formatWeight(data.totals.netWeight)}</dd></div>
              <div className="flex gap-1.5"><dt className="text-muted">Fine</dt><dd className="tabular font-medium">{formatWeight(data.totals.fineWeight)}</dd></div>
              <div className="flex gap-1.5"><dt className="text-muted">Book cost</dt><dd><CurrencyDisplay amount={rupees(data.totals.cost)} size="sm" /></dd></div>
            </dl>
          )}
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(r) => r.id}
            isLoading={list.isLoading}
            selectable={canMove || canReserve}
            selectedIds={selected}
            onSelectedIdsChange={setSelected}
            sort={{ columnId: columnForSort(params.sort ?? "updatedAt"), direction: params.order ?? "desc" }}
            onSortChange={(s) => setParams({ sort: SORT_BY_COLUMN[s.columnId], order: s.direction })}
            onRowClick={setQuick}
            mobileTitle={(r) => (<span className="flex flex-col"><span className="font-mono">{r.itemCode}</span><span className="text-caption font-normal text-muted">{r.product?.name ?? "No product"}</span></span>)}
          />
          {data && <Pagination className="pt-4" page={data.page} pageCount={pageCount} onPageChange={(page) => setParams({ page })} summary={`${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total}`} />}
        </div>
      )}

      {inItems && (canMove || canReserve) && (
        <BulkActionBar
          selectedCount={selected.size}
          onClear={() => setSelected(new Set())}
          actions={
            commonStatus && (ops.length > 0 || canHold) ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm">Actions <ChevronDown className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canMove && ops.map((o) => <DropdownMenuItem key={o.kind} onSelect={() => setOp(o)}>{o.label}</DropdownMenuItem>)}
                  {canMove && canHold && <DropdownMenuSeparator />}
                  {canHold && <DropdownMenuItem onSelect={() => setReserving(true)}>Reserve for an order…</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="text-body-sm text-muted">{commonStatus ? "No bulk action for this status" : "Select pieces with the same status"}</span>
            )
          }
        />
      )}

      <QuickView item={quick} onClose={() => setQuick(null)} />
      <MoveDialog op={op} items={picked} onClose={() => setOp(null)} onDone={() => { setOp(null); setSelected(new Set()); }} />
      <ReserveDialog itemIds={picked.map((p) => p.id)} open={reserving} onClose={() => setReserving(false)} onDone={() => { setReserving(false); setSelected(new Set()); }} />
    </>
  );
}
