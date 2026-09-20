import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "../lib/utils";
import { Checkbox } from "./checkbox";
import { EmptyState } from "./empty-state";
import { Skeleton } from "./skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "right";
  className?: string;
  /** Rendered in the mobile stacked-card view; defaults to `cell`. */
  mobileHidden?: boolean;
}

export interface DataTableSort {
  columnId: string;
  direction: "asc" | "desc";
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (ids: Set<string>) => void;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Title shown per-card in the mobile view. */
  mobileTitle?: (row: T) => React.ReactNode;
  className?: string;
}

/** Dense, sortable, selectable table. Collapses to a stacked-card list below `md` so it stays usable on mobile. */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  sort,
  onSortChange,
  selectable,
  selectedIds,
  onSelectedIdsChange,
  onRowClick,
  isLoading,
  emptyTitle = "No records",
  emptyDescription = "There is nothing to show yet.",
  mobileTitle,
  className,
}: DataTableProps<T>) {
  const allSelected = selectable && data.length > 0 && data.every((row) => selectedIds?.has(getRowId(row)));
  const someSelected = selectable && !allSelected && data.some((row) => selectedIds?.has(getRowId(row)));

  const toggleAll = () => {
    if (!onSelectedIdsChange) return;
    if (allSelected) onSelectedIdsChange(new Set());
    else onSelectedIdsChange(new Set(data.map(getRowId)));
  };

  const toggleRow = (id: string) => {
    if (!onSelectedIdsChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={className}>
      {/* Desktop / tablet: full table */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all rows"
                />
              </TableHead>
            )}
            {columns.map((col) => (
              <TableHead
                key={col.id}
                className={cn(col.align === "right" && "text-right", col.className)}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() =>
                      onSortChange?.({
                        columnId: col.id,
                        direction: sort?.columnId === col.id && sort.direction === "asc" ? "desc" : "asc",
                      })
                    }
                  >
                    {col.header}
                    {sort?.columnId === col.id ? (
                      sort.direction === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => {
            const id = getRowId(row);
            return (
              <TableRow
                key={id}
                onClick={() => onRowClick?.(row)}
                className={cn(onRowClick && "cursor-pointer")}
                data-state={selectedIds?.has(id) ? "selected" : undefined}
              >
                {selectable && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds?.has(id) ?? false}
                      onCheckedChange={() => toggleRow(id)}
                      aria-label={`Select row ${id}`}
                    />
                  </TableCell>
                )}
                {columns.map((col) => (
                  <TableCell key={col.id} className={cn(col.align === "right" && "text-right", col.className)}>
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Mobile: stacked cards */}
      <ul className="flex flex-col gap-2 md:hidden">
        {data.map((row) => {
          const id = getRowId(row);
          return (
            <li
              key={id}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "rounded-lg border border-border bg-surface p-3",
                onRowClick && "cursor-pointer active:bg-surface-sunken"
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                {selectable && (
                  <Checkbox
                    checked={selectedIds?.has(id) ?? false}
                    onCheckedChange={() => toggleRow(id)}
                    aria-label={`Select row ${id}`}
                  />
                )}
                {mobileTitle && <span className="font-medium text-foreground">{mobileTitle(row)}</span>}
              </div>
              <dl className="grid grid-cols-2 gap-y-1.5 text-body-sm">
                {columns
                  .filter((c) => !c.mobileHidden)
                  .map((col) => (
                    <div key={col.id} className="contents">
                      <dt className="text-muted">{col.header}</dt>
                      <dd className={cn("text-right text-foreground", col.className)}>{col.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
