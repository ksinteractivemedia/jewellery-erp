"use client";

import Link from "next/link";
import { PERMISSIONS } from "@jewellery/types";
import { Alert, Button, EmptyState, PageHeader, Skeleton } from "@jewellery/ui";
import { useProduct } from "../../lib/api/queries";
import { ApiError } from "../../lib/auth/api-client";
import { RequirePermission } from "../auth/require-permission";
import { ProductForm } from "./product-form";

export function EditProduct({ id }: { id: string }) {
  const { data: product, isLoading, error } = useProduct(id);
  const crumbs = [{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Products", href: "/inventory/products" }];

  return (
    <RequirePermission permission={PERMISSIONS.CATALOG_MANAGE}>
      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : error || !product ? (
        <>
          <PageHeader title="Edit product" breadcrumb={crumbs} />
          {error instanceof ApiError && error.status === 404 ? (
            <EmptyState title="This product doesn't exist" action={<Button asChild variant="secondary"><Link href="/inventory/products">Back to products</Link></Button>} />
          ) : (
            <Alert variant="danger">{error instanceof Error ? error.message : "Couldn't load the product."}</Alert>
          )}
        </>
      ) : (
        <>
          <PageHeader title={`Edit ${product.name}`} description={product.sku} breadcrumb={[...crumbs, { label: product.name, href: `/inventory/products/${product.id}` }, { label: "Edit" }]} />
          <ProductForm product={product} />
        </>
      )}
    </RequirePermission>
  );
}
