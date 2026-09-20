"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { PERMISSIONS, type ProductVariant } from "@jewellery/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  ProductGallery,
  PurityBadge,
  Skeleton,
  StatusBadge,
  formatDate,
  formatWeight,
} from "@jewellery/ui";
import { catalogApi } from "../../lib/api/catalog";
import { useCatalogMutation, useProduct } from "../../lib/api/queries";
import { ApiError } from "../../lib/auth/api-client";
import { useAuth } from "../../lib/auth/auth-context";
import { ChannelBadges, ProductStatusBadge } from "./product-badges";
import { VariantDialog } from "./variant-dialog";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="text-body text-foreground">{children ?? <span className="text-muted">—</span>}</dd>
    </div>
  );
}

const videoHost = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function ProductDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.CATALOG_MANAGE);
  const { data: product, isLoading, error } = useProduct(id);

  const [variantDialog, setVariantDialog] = React.useState<{ variant?: ProductVariant } | null>(null);
  const [confirm, setConfirm] = React.useState<"delete" | "toggle" | { variant: ProductVariant } | null>(null);

  const toggle = useCatalogMutation(() => catalogApi.updateProduct(id, { isActive: !product?.isActive }), {
    success: () => (product?.isActive ? "Product deactivated" : "Product activated"),
    onSuccess: () => setConfirm(null),
  });
  const remove = useCatalogMutation(() => catalogApi.deleteProduct(id), {
    success: "Product deleted",
    onSuccess: () => router.replace("/inventory/products"),
    onError: () => setConfirm(null),
  });
  const removeVariant = useCatalogMutation((variantId: string) => catalogApi.deleteVariant(id, variantId), {
    success: "Variant deleted",
    onSuccess: () => setConfirm(null),
    onError: () => setConfirm(null),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (error || !product) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <>
        <PageHeader title={missing ? "Product not found" : "Couldn't load product"} breadcrumb={[{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Products", href: "/inventory/products" }]} />
        {missing ? (
          <EmptyState title="This product doesn't exist" description="It may have been deleted." action={<Button asChild variant="secondary"><Link href="/inventory/products">Back to products</Link></Button>} />
        ) : (
          <Alert variant="danger">{error instanceof Error ? error.message : "Something went wrong."}</Alert>
        )}
      </>
    );
  }

  const gallery = product.images.map((i) => ({ src: i.url, alt: i.alt || product.name }));

  return (
    <>
      <PageHeader
        title={product.name}
        description={product.sku}
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Products", href: "/inventory/products" }, { label: product.name }]}
        actions={
          canManage && (
            <>
              <Button variant="secondary" onClick={() => setConfirm("toggle")}>{product.isActive ? "Deactivate" : "Activate"}</Button>
              <Button asChild>
                <Link href={`/inventory/products/${product.id}/edit`}>
                  <Pencil className="h-4 w-4" /> Edit
                </Link>
              </Button>
            </>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <ProductStatusBadge isActive={product.isActive} />
        <ChannelBadges b2c={product.b2cEnabled} b2b={product.b2bEnabled} />
        {product.purity && <PurityBadge purity={product.purity} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="pt-6">
              {gallery.length ? <ProductGallery images={gallery} /> : <EmptyState title="No images" description={canManage ? "Add images from Edit." : undefined} className="py-10" />}
            </CardContent>
          </Card>
          {product.videos.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Videos</CardTitle></CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {product.videos.map((url) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-body-sm text-primary-active hover:underline">
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> {videoHost(url)}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-5">
              {product.description && <p className="whitespace-pre-line text-body text-foreground">{product.description}</p>}
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Fact label="Category">{product.category?.name}</Fact>
                <Fact label="Metal">{product.metal?.name}</Fact>
                <Fact label="Purity">{product.purity}</Fact>
                <Fact label="Typical gross weight">{product.defaultGrossWeight !== undefined ? formatWeight(product.defaultGrossWeight) : undefined}</Fact>
                <Fact label="Typical net weight">{product.defaultNetWeight !== undefined ? formatWeight(product.defaultNetWeight) : undefined}</Fact>
                <Fact label="URL slug"><span className="break-all font-mono text-body-sm">{product.slug}</span></Fact>
              </dl>
              <div className="flex flex-col gap-1.5">
                <span className="text-caption text-muted">Collections</span>
                {product.collections.length ? <div className="flex flex-wrap gap-1.5">{product.collections.map((c) => <Badge key={c.id} variant="outline">{c.name}</Badge>)}</div> : <span className="text-muted">—</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-caption text-muted">Tags</span>
                {product.tags.length ? <div className="flex flex-wrap gap-1.5">{product.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div> : <span className="text-muted">—</span>}
              </div>
              <p className="text-caption text-muted">Created {formatDate(product.createdAt)} · Updated {formatDate(product.updatedAt)}</p>
            </CardContent>
          </Card>

          {product.stock && (
            <Card>
              <CardHeader>
                <CardTitle>Stock</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex gap-8">
                  <Fact label="Physical pieces">{product.stock.pieces}</Fact>
                  <Fact label="Available now">{product.stock.available}</Fact>
                </div>
                <p className="text-caption text-muted">Counted from inventory items made from this design. The product itself holds no quantity.</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Variants</CardTitle>
              {canManage && (
                <Button size="sm" variant="secondary" onClick={() => setVariantDialog({})}>
                  <Plus className="h-4 w-4" /> Add variant
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {product.variants.length === 0 ? (
                <p className="text-body-sm text-muted">No variants — this product is sold as a single design.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border-subtle">
                  {product.variants.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-mono text-body-sm text-foreground">{v.sku}</span>
                        <span className="text-caption text-muted">
                          {Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(" · ") || "No attributes"}
                          {v.defaultGrossWeight !== undefined && ` · ${formatWeight(v.defaultGrossWeight)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={v.isActive ? "success" : "neutral"} label={v.isActive ? "Active" : "Inactive"} />
                        {canManage && (
                          <>
                            <Button size="icon" variant="ghost" aria-label={`Edit variant ${v.sku}`} onClick={() => setVariantDialog({ variant: v })}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="text-danger" aria-label={`Delete variant ${v.sku}`} onClick={() => setConfirm({ variant: v })}><Trash2 className="h-4 w-4" /></Button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader><CardTitle>Danger zone</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-md text-body-sm text-muted">Deleting is permanent and only possible while no inventory piece was made from this product. Otherwise deactivate it.</p>
                <Button variant="destructive" onClick={() => setConfirm("delete")}>Delete product</Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <VariantDialog productId={product.id} variant={variantDialog?.variant} open={variantDialog !== null} onOpenChange={(o) => !o && setVariantDialog(null)} />

      <ConfirmDialog
        open={confirm === "toggle"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={product.isActive ? "Deactivate this product?" : "Activate this product?"}
        description={product.isActive ? "It stays in the catalogue with its history, but is no longer offered." : "It will be offered again on the channels it is enabled for."}
        confirmLabel={product.isActive ? "Deactivate" : "Activate"}
        destructive={false}
        loading={toggle.isPending}
        onConfirm={() => toggle.mutate(undefined)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${product.name}?`}
        description="This permanently removes the product and its variants. It cannot be undone."
        confirmLabel="Delete product"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
      <ConfirmDialog
        open={typeof confirm === "object" && confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this variant?"
        description={typeof confirm === "object" && confirm ? `Variant ${confirm.variant.sku} will be permanently removed.` : ""}
        confirmLabel="Delete variant"
        loading={removeVariant.isPending}
        onConfirm={() => typeof confirm === "object" && confirm && removeVariant.mutate(confirm.variant.id)}
      />
    </>
  );
}
