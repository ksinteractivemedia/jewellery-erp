"use client";

import * as React from "react";
import Link from "next/link";
import { CornerDownRight, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { PERMISSIONS, type CategoryNode } from "@jewellery/types";
import { Alert, Button, Card, ConfirmDialog, EmptyState, PageHeader, Skeleton, StatusBadge, cn } from "@jewellery/ui";
import { catalogApi } from "../../lib/api/catalog";
import { useCatalogMutation, useCategories } from "../../lib/api/queries";
import { useAuth } from "../../lib/auth/auth-context";
import { TaxonomyDialog, emptyDraft, type TaxonomyDraft } from "./taxonomy-dialog";

interface Row {
  node: CategoryNode;
  depth: number;
}

/** Depth-first flattening so children render directly under their parent; orphans (parent missing) surface at the top level. */
function flatten(nodes: CategoryNode[]): Row[] {
  const byParent = new Map<string | undefined, CategoryNode[]>();
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    const key = n.parentId && ids.has(n.parentId) ? n.parentId : undefined;
    byParent.set(key, [...(byParent.get(key) ?? []), n]);
  }
  const out: Row[] = [];
  const walk = (parent: string | undefined, depth: number) => {
    for (const node of byParent.get(parent) ?? []) {
      out.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

const descendantsOf = (id: string, nodes: CategoryNode[]): Set<string> => {
  const found = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) if (n.parentId && found.has(n.parentId) && !found.has(n.id)) (found.add(n.id), (grew = true));
  }
  return found;
};

export function CategoriesManager() {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.CATALOG_MANAGE);
  const { data, isLoading, error, refetch } = useCategories();
  const [draft, setDraft] = React.useState<TaxonomyDraft | null>(null);
  const [toDelete, setToDelete] = React.useState<CategoryNode | null>(null);

  const remove = useCatalogMutation((id: string) => catalogApi.deleteCategory(id), {
    success: "Category deleted",
    onSuccess: () => setToDelete(null),
    onError: () => setToDelete(null),
  });

  const nodes = data ?? [];
  const rows = flatten(nodes);
  const excluded = draft?.id ? descendantsOf(draft.id, nodes) : new Set<string>();
  const parentOptions = rows.filter(({ node }) => !excluded.has(node.id)).map(({ node, depth }) => ({ value: node.id, label: `${"— ".repeat(depth)}${node.name}` }));

  return (
    <>
      <PageHeader
        title="Categories"
        description="The catalogue's structure. Each product sits in one category."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Categories" }]}
        actions={canManage && <Button onClick={() => setDraft(emptyDraft())}><Plus className="h-4 w-4" /> New category</Button>}
      />
      {error ? (
        <Alert variant="danger" title="Couldn't load categories"><Button size="sm" variant="secondary" onClick={() => refetch()}>Retry</Button></Alert>
      ) : isLoading ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<FolderTree className="h-8 w-8" />} title="No categories yet" description="Create categories such as Rings, Necklaces and Bangles to organise the catalogue." action={canManage ? <Button onClick={() => setDraft(emptyDraft())}>New category</Button> : undefined} />
      ) : (
        <Card>
          <ul className="divide-y divide-border-subtle" aria-label="Categories">
            {rows.map(({ node, depth }) => (
              <li key={node.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ paddingLeft: `${1 + depth * 1.5}rem` }}>
                <div className="flex min-w-0 items-center gap-2">
                  {depth > 0 && <CornerDownRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
                  <div className="flex min-w-0 flex-col">
                    <span className={cn("truncate font-medium", !node.isActive && "text-muted")}>{node.name}</span>
                    <span className="truncate text-caption text-muted">/{node.slug}{node.description && ` · ${node.description}`}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/inventory/products?categoryId=${node.id}`} className="text-body-sm text-primary-active hover:underline">
                    {node.productCount} product{node.productCount === 1 ? "" : "s"}
                  </Link>
                  <StatusBadge tone={node.isActive ? "success" : "neutral"} label={node.isActive ? "Active" : "Inactive"} />
                  {canManage && (
                    <span className="flex">
                      <Button size="icon" variant="ghost" aria-label={`Add sub-category under ${node.name}`} onClick={() => setDraft(emptyDraft({ parentId: node.id }))}><Plus className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Edit ${node.name}`} onClick={() => setDraft({ id: node.id, name: node.name, slug: node.slug, description: node.description ?? "", parentId: node.parentId ?? "", isActive: node.isActive })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-danger" aria-label={`Delete ${node.name}`} onClick={() => setToDelete(node)}><Trash2 className="h-4 w-4" /></Button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <TaxonomyDialog kind="category" draft={draft} parentOptions={parentOptions} onOpenChange={(o) => !o && setDraft(null)} onCreate={(i) => catalogApi.createCategory(i as never)} onUpdate={(id, i) => catalogApi.updateCategory(id, i as never)} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.name ?? "category"}?`}
        description="Only an empty category with no sub-categories can be deleted. To hide one that's in use, mark it inactive instead."
        confirmLabel="Delete category"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  );
}
