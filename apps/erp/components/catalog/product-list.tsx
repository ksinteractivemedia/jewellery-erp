"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Filter, Gem, Plus } from "lucide-react";
import { PERMISSIONS } from "@jewellery/types";
import type { BulkProductActionInput } from "@jewellery/validation";
import type { ProductListItem } from "@jewellery/types";
import {
  Alert,
  BulkActionBar,
  Button,
  Combobox,
  ConfirmDialog,
  DataTable,
  DataToolbar,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  FilterBar,
  FilterDrawer,
  PageHeader,
  Pagination,
  PurityBadge,
  SearchInput,
  formatDate,
} from "@jewellery/ui";
import { catalogApi } from "../../lib/api/catalog";
import { useCatalogMeta, useCatalogMutation, useCategories, useCollections, useProducts } from "../../lib/api/queries";
import { useAuth } from "../../lib/auth/auth-context";
import { useProductListParams } from "../../lib/catalog/list-params";
import { FilterSelect } from "./filter-select";
import { ChannelBadges, ProductStatusBadge, ProductThumb } from "./product-badges";

const SORTABLE = { name: "name", sku: "sku", updated: "updatedAt" } as const;
const columnToSort = (id: string) => SORTABLE[id as keyof typeof SORTABLE];
const sortToColumn = (sort: string) => Object.entries(SORTABLE).find(([, v]) => v === sort)?.[0] ?? "updated";

type Pick = { kind: "add-to-collection" | "remove-from-collection" | "set-category" } | null;

export function ProductList() {
  const router = useRouter();
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.CATALOG_MANAGE);
  const { params, setParams, clearFilters } = useProductListParams();
  const products = useProducts(params);
  const meta = useCatalogMeta();
  const categories = useCategories();
  const collections = useCollections();

  const [search, setSearch] = React.useState(params.q ?? "");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirm, setConfirm] = React.useState<{ input: BulkProductActionInput; title: string; description: string } | null>(null);
  const [pick, setPick] = React.useState<Pick>(null);

  // Typing filters as you go, but one request per pause — and the URL (not this box) is the source of truth.
  React.useEffect(() => {
    const t = setTimeout(() => search !== (params.q ?? "") && setParams({ q: search.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => setSearch(params.q ?? ""), [params.q]);
  // A selection made on one page/filter must not silently apply to rows the user can no longer see.
  const viewKey = JSON.stringify({ ...params, sort: undefined, order: undefined });
  React.useEffect(() => setSelected(new Set()), [viewKey]);

  const bulk = useCatalogMutation(catalogApi.bulkProducts, {
    success: (r) => `${r.modified} product${r.modified === 1 ? "" : "s"} updated`,
    onSuccess: () => {
      setSelected(new Set());
      setConfirm(null);
      setPick(null);
    },
  });
  const runBulk = (input: BulkProductActionInput, title: string, description: string) => setConfirm({ input, title, description });

  const data = products.data;
  const rows = data?.items ?? [];
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const ids = [...selected];
  const n = ids.length;
  const noun = `${n} product${n === 1 ? "" : "s"}`;

  const categoryOptions = (categories.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const collectionOptions = (collections.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const metalOptions = (meta.data?.metals ?? []).map((m) => ({ value: m.id, label: m.name }));
  const purityOptions = (meta.data?.usedPurities ?? []).map((p) => ({ value: p, label: p }));

  const channelValue = params.b2cEnabled && params.b2bEnabled ? "both" : params.b2cEnabled ? "b2c" : params.b2bEnabled ? "b2b" : undefined;
  const statusValue = params.isActive === undefined ? undefined : params.isActive ? "active" : "inactive";

  const chips = [
    params.q && { id: "q", label: `“${params.q}”` },
    params.categoryId && { id: "categoryId", label: `Category: ${categoryOptions.find((o) => o.value === params.categoryId)?.label ?? "…"}` },
    params.collectionId && { id: "collectionId", label: `Collection: ${collectionOptions.find((o) => o.value === params.collectionId)?.label ?? "…"}` },
    params.metalId && { id: "metalId", label: `Metal: ${metalOptions.find((o) => o.value === params.metalId)?.label ?? "…"}` },
    params.purity && { id: "purity", label: `Purity: ${params.purity}` },
    params.tag && { id: "tag", label: `Tag: ${params.tag}` },
    statusValue && { id: "isActive", label: statusValue === "active" ? "Active" : "Inactive" },
    channelValue && { id: "channel", label: `Channel: ${channelValue.toUpperCase()}` },
  ].filter(Boolean) as { id: string; label: string }[];

  const removeChip = (id: string) => (id === "channel" ? setParams({ b2cEnabled: undefined, b2bEnabled: undefined }) : setParams({ [id]: undefined }));
  const setChannel = (v?: string) => setParams({ b2cEnabled: v === "b2c" || v === "both" ? true : undefined, b2bEnabled: v === "b2b" || v === "both" ? true : undefined });

  const filterControls = (
    <>
      <FilterSelect label="Status" allLabel="Any status" value={statusValue} onChange={(v) => setParams({ isActive: v === undefined ? undefined : v === "active" })} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
      <div className="w-full md:w-44">
        <Combobox aria-label="Category" placeholder="Any category" searchPlaceholder="Search categories…" options={[{ value: "", label: "Any category" }, ...categoryOptions]} value={params.categoryId ?? ""} onValueChange={(v) => setParams({ categoryId: v || undefined })} />
      </div>
      <div className="w-full md:w-44">
        <Combobox aria-label="Collection" placeholder="Any collection" searchPlaceholder="Search collections…" options={[{ value: "", label: "Any collection" }, ...collectionOptions]} value={params.collectionId ?? ""} onValueChange={(v) => setParams({ collectionId: v || undefined })} />
      </div>
      <FilterSelect label="Metal" allLabel="Any metal" value={params.metalId} onChange={(v) => setParams({ metalId: v })} options={metalOptions} />
      <FilterSelect label="Purity" allLabel="Any purity" value={params.purity} onChange={(v) => setParams({ purity: v })} options={purityOptions} className="w-full md:w-32" />
      <FilterSelect label="Channel" allLabel="Any channel" value={channelValue} onChange={setChannel} options={[{ value: "b2c", label: "B2C enabled" }, { value: "b2b", label: "B2B enabled" }, { value: "both", label: "B2C + B2B" }]} />
    </>
  );

  const columns: DataTableColumn<ProductListItem>[] = [
    {
      id: "name",
      header: "Product",
      sortable: true,
      mobileHidden: true,
      cell: (p) => (
        <span className="flex items-center gap-3">
          <ProductThumb url={p.primaryImageUrl} name={p.name} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{p.name}</span>
            <span className="text-caption text-muted">{p.imageCount ? `${p.imageCount} image${p.imageCount === 1 ? "" : "s"}` : "No images"}</span>
          </span>
        </span>
      ),
    },
    { id: "sku", header: "SKU", sortable: true, cell: (p) => <span className="font-mono text-body-sm">{p.sku}</span> },
    { id: "category", header: "Category", cell: (p) => p.category?.name ?? <span className="text-muted">—</span> },
    {
      id: "metal",
      header: "Metal",
      cell: (p) => (p.metal ? <span className="inline-flex items-center gap-1.5">{p.metal.name}{p.purity && <PurityBadge purity={p.purity} />}</span> : <span className="text-muted">—</span>),
    },
    { id: "channels", header: "Channels", cell: (p) => <ChannelBadges b2c={p.b2cEnabled} b2b={p.b2bEnabled} /> },
    { id: "variants", header: "Variants", align: "right", cell: (p) => p.variantCount || <span className="text-muted">—</span> },
    { id: "status", header: "Status", cell: (p) => <ProductStatusBadge isActive={p.isActive} /> },
    { id: "updated", header: "Updated", sortable: true, cell: (p) => <span className="text-muted">{formatDate(p.updatedAt)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        description="The catalogue: designs and their definitions. Physical pieces live under Inventory."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Products" }]}
        actions={
          canManage && (
            <Button asChild>
              <Link href="/inventory/products/new">
                <Plus className="h-4 w-4" /> New product
              </Link>
            </Button>
          )
        }
      />

      <DataToolbar
        left={
          <>
            <div className="min-w-[14rem] flex-1 md:max-w-sm">
              <SearchInput aria-label="Search products" placeholder="Search name, SKU, tag or variant SKU…" value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} />
            </div>
            <Button variant="secondary" className="md:hidden" onClick={() => setFiltersOpen(true)}>
              <Filter className="h-4 w-4" /> Filters{chips.length > 0 && ` (${chips.length})`}
            </Button>
          </>
        }
        right={
          <label className="flex items-center gap-2 text-body-sm text-muted">
            Sort
            <FilterSelect
              label="Sort products"
              allLabel="Recently updated"
              value={params.sort === "updatedAt" && params.order === "desc" ? undefined : `${params.sort}:${params.order}`}
              onChange={(v) => {
                const [sort = "updatedAt", order = "desc"] = (v ?? "updatedAt:desc").split(":");
                setParams({ sort, order });
              }}
              options={[
                { value: "name:asc", label: "Name A–Z" },
                { value: "name:desc", label: "Name Z–A" },
                { value: "sku:asc", label: "SKU A–Z" },
                { value: "sku:desc", label: "SKU Z–A" },
                { value: "createdAt:desc", label: "Newest first" },
                { value: "createdAt:asc", label: "Oldest first" },
                { value: "updatedAt:asc", label: "Least recently updated" },
              ]}
              className="w-44"
            />
          </label>
        }
      />

      <div className="hidden md:block">
        <FilterBar controls={filterControls} activeFilters={chips} onRemoveFilter={removeChip} onClearAll={() => { clearFilters(); setSearch(""); }} className="pb-3" />
      </div>
      {chips.length > 0 && (
        <div className="pb-3 md:hidden">
          <FilterBar activeFilters={chips} onRemoveFilter={removeChip} onClearAll={() => { clearFilters(); setSearch(""); }} />
        </div>
      )}
      <FilterDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        onApply={() => setFiltersOpen(false)}
        onClear={() => { clearFilters(); setSearch(""); }}
        resultCount={data?.total}
      >
        <div className="flex flex-col gap-3">{filterControls}</div>
      </FilterDrawer>

      {products.isError ? (
        <Alert variant="danger" title="Couldn't load products">
          <div className="flex items-center justify-between gap-3">
            <span>{products.error instanceof Error ? products.error.message : "Try again."}</span>
            <Button size="sm" variant="secondary" onClick={() => products.refetch()}>Retry</Button>
          </div>
        </Alert>
      ) : !products.isLoading && rows.length === 0 ? (
        <EmptyState
          icon={<Gem className="h-8 w-8" />}
          title={chips.length ? "No products match these filters" : "No products yet"}
          description={chips.length ? "Try removing a filter or searching for something else." : "Products are the designs you sell. Create the first one to get started."}
          action={chips.length ? <Button variant="secondary" onClick={() => { clearFilters(); setSearch(""); }}>Clear filters</Button> : canManage ? <Button asChild><Link href="/inventory/products/new">New product</Link></Button> : undefined}
        />
      ) : (
        <div aria-busy={products.isFetching} className={products.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(p) => p.id}
            isLoading={products.isLoading}
            selectable={canManage}
            selectedIds={selected}
            onSelectedIdsChange={setSelected}
            sort={{ columnId: sortToColumn(params.sort ?? "updatedAt"), direction: params.order ?? "desc" }}
            onSortChange={(s) => setParams({ sort: columnToSort(s.columnId), order: s.direction })}
            onRowClick={(p) => router.push(`/inventory/products/${p.id}`)}
            mobileTitle={(p) => (
              <span className="flex items-center gap-2">
                <ProductThumb url={p.primaryImageUrl} name={p.name} className="h-8 w-8" />
                {p.name}
              </span>
            )}
          />
          {data && (
            <Pagination
              className="pt-4"
              page={data.page}
              pageCount={pageCount}
              onPageChange={(page) => setParams({ page })}
              summary={`${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total}`}
            />
          )}
        </div>
      )}

      {canManage && (
        <BulkActionBar
          selectedCount={n}
          onClear={() => setSelected(new Set())}
          actions={
            <>
              <Button size="sm" variant="secondary" onClick={() => runBulk({ action: "set-active", ids, value: true }, `Activate ${noun}?`, "They will show as active again.")}>Activate</Button>
              <Button size="sm" variant="secondary" onClick={() => runBulk({ action: "set-active", ids, value: false }, `Deactivate ${noun}?`, "Inactive products stay in the catalogue and keep their history, but are no longer offered.")}>Deactivate</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="secondary">More <ChevronDown className="h-3.5 w-3.5" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => runBulk({ action: "set-b2c", ids, value: true }, `Enable B2C for ${noun}?`, "They become visible on the B2C storefront.")}>Enable B2C</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runBulk({ action: "set-b2c", ids, value: false }, `Disable B2C for ${noun}?`, "They are hidden from the B2C storefront.")}>Disable B2C</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runBulk({ action: "set-b2b", ids, value: true }, `Enable B2B for ${noun}?`, "They become visible in the B2B portal.")}>Enable B2B</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runBulk({ action: "set-b2b", ids, value: false }, `Disable B2B for ${noun}?`, "They are hidden from the B2B portal.")}>Disable B2B</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setPick({ kind: "add-to-collection" })}>Add to collection…</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPick({ kind: "remove-from-collection" })}>Remove from collection…</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPick({ kind: "set-category" })}>Set category…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && !bulk.isPending && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel="Apply"
        destructive={false}
        loading={bulk.isPending}
        onConfirm={() => confirm && bulk.mutate(confirm.input)}
      />
      <BulkPickDialog
        pick={pick}
        onClose={() => setPick(null)}
        count={n}
        collections={collectionOptions}
        categories={categoryOptions}
        loading={bulk.isPending}
        onSubmit={(input) => bulk.mutate({ ...input, ids } as BulkProductActionInput)}
      />
    </>
  );
}

/** Second step for bulk actions that need a target (which collection / category). */
function BulkPickDialog({
  pick,
  onClose,
  count,
  collections,
  categories,
  loading,
  onSubmit,
}: {
  pick: Pick;
  onClose: () => void;
  count: number;
  collections: { value: string; label: string }[];
  categories: { value: string; label: string }[];
  loading: boolean;
  onSubmit: (input: { action: string; collectionId?: string; categoryId?: string | null }) => void;
}) {
  const [target, setTarget] = React.useState("");
  React.useEffect(() => setTarget(""), [pick?.kind]);
  if (!pick) return null;
  const isCategory = pick.kind === "set-category";
  const options = isCategory ? [{ value: "", label: "No category" }, ...categories] : collections;
  const titles = { "add-to-collection": "Add to collection", "remove-from-collection": "Remove from collection", "set-category": "Set category" };
  const canSubmit = isCategory || target !== "";
  return (
    <Dialog open onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[pick.kind]}</DialogTitle>
          <DialogDescription>Applies to {count} selected product{count === 1 ? "" : "s"}.</DialogDescription>
        </DialogHeader>
        <Combobox aria-label={isCategory ? "Category" : "Collection"} placeholder={isCategory ? "Choose a category" : "Choose a collection"} options={options} value={target} onValueChange={setTarget} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            disabled={!canSubmit}
            loading={loading}
            onClick={() => onSubmit(isCategory ? { action: pick.kind, categoryId: target || null } : { action: pick.kind, collectionId: target })}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
