"use client";

import * as React from "react";
import Link from "next/link";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { PERMISSIONS, type CollectionView } from "@jewellery/types";
import { Alert, Button, Card, ConfirmDialog, EmptyState, PageHeader, Skeleton, StatusBadge, cn } from "@jewellery/ui";
import { catalogApi } from "../../lib/api/catalog";
import { useCatalogMutation, useCollections } from "../../lib/api/queries";
import { useAuth } from "../../lib/auth/auth-context";
import { TaxonomyDialog, emptyDraft, type TaxonomyDraft } from "./taxonomy-dialog";

export function CollectionsManager() {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.CATALOG_MANAGE);
  const { data, isLoading, error, refetch } = useCollections();
  const [draft, setDraft] = React.useState<TaxonomyDraft | null>(null);
  const [toDelete, setToDelete] = React.useState<CollectionView | null>(null);

  const remove = useCatalogMutation((id: string) => catalogApi.deleteCollection(id), {
    success: (r) => `Collection deleted${r.detachedFrom ? ` · removed from ${r.detachedFrom} product${r.detachedFrom === 1 ? "" : "s"}` : ""}`,
    onSuccess: () => setToDelete(null),
    onError: () => setToDelete(null),
  });
  const collections = data ?? [];

  return (
    <>
      <PageHeader
        title="Collections"
        description="Curated groupings such as Bridal Edit or Festive. A product can be in several."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Collections" }]}
        actions={canManage && <Button onClick={() => setDraft(emptyDraft())}><Plus className="h-4 w-4" /> New collection</Button>}
      />
      {error ? (
        <Alert variant="danger" title="Couldn't load collections"><Button size="sm" variant="secondary" onClick={() => refetch()}>Retry</Button></Alert>
      ) : isLoading ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : collections.length === 0 ? (
        <EmptyState icon={<Layers className="h-8 w-8" />} title="No collections yet" description="Group products for campaigns, seasons or occasions." action={canManage ? <Button onClick={() => setDraft(emptyDraft())}>New collection</Button> : undefined} />
      ) : (
        <Card>
          <ul className="divide-y divide-border-subtle" aria-label="Collections">
            {collections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className={cn("truncate font-medium", !c.isActive && "text-muted")}>{c.name}</span>
                  <span className="truncate text-caption text-muted">/{c.slug}{c.description && ` · ${c.description}`}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/inventory/products?collectionId=${c.id}`} className="text-body-sm text-primary-active hover:underline">
                    {c.productCount} product{c.productCount === 1 ? "" : "s"}
                  </Link>
                  <StatusBadge tone={c.isActive ? "success" : "neutral"} label={c.isActive ? "Active" : "Inactive"} />
                  {canManage && (
                    <span className="flex">
                      <Button size="icon" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setDraft({ id: c.id, name: c.name, slug: c.slug, description: c.description ?? "", parentId: "", isActive: c.isActive })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-danger" aria-label={`Delete ${c.name}`} onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4" /></Button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <TaxonomyDialog kind="collection" draft={draft} onOpenChange={(o) => !o && setDraft(null)} onCreate={(i) => catalogApi.createCollection(i as never)} onUpdate={(id, i) => catalogApi.updateCollection(id, i as never)} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.name ?? "collection"}?`}
        description={toDelete?.productCount ? `It will be removed from its ${toDelete.productCount} product${toDelete.productCount === 1 ? "" : "s"}. The products themselves are not deleted.` : "This collection is empty."}
        confirmLabel="Delete collection"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  );
}
