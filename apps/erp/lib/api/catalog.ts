import type {
  BulkResult,
  CatalogMeta,
  CategoryNode,
  CollectionView,
  ProductDetail,
  ProductListResult,
  ProductVariant,
} from "@jewellery/types";
import type {
  BulkProductActionInput,
  CreateProductCategoryInput,
  CreateProductCollectionInput,
  CreateProductInput,
  CreateVariantBodyInput,
  ProductListQueryInput,
  UpdateProductCategoryInput,
  UpdateProductCollectionInput,
  UpdateProductInput,
  UpdateProductVariantInput,
} from "@jewellery/validation";
import { apiFetch } from "../auth/api-client";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

/** Only defined, non-empty values reach the URL — the API rejects unknown/empty params rather than ignoring them. */
export function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const catalogApi = {
  listProducts: (query: ProductListQueryInput) => apiFetch<ProductListResult>(`/api/products${toQueryString(query)}`),
  getProduct: (id: string) => apiFetch<{ product: ProductDetail }>(`/api/products/${id}`).then((r) => r.product),
  createProduct: (input: CreateProductInput) => apiFetch<{ product: ProductDetail }>("/api/products", json("POST", input)).then((r) => r.product),
  updateProduct: (id: string, input: UpdateProductInput) => apiFetch<{ product: ProductDetail }>(`/api/products/${id}`, json("PATCH", input)).then((r) => r.product),
  deleteProduct: (id: string) => apiFetch<void>(`/api/products/${id}`, { method: "DELETE" }),
  bulkProducts: (input: BulkProductActionInput) => apiFetch<BulkResult>("/api/products/bulk", json("POST", input)),
  meta: () => apiFetch<CatalogMeta>("/api/products/meta"),

  createVariant: (productId: string, input: CreateVariantBodyInput) => apiFetch<{ variant: ProductVariant }>(`/api/products/${productId}/variants`, json("POST", input)).then((r) => r.variant),
  updateVariant: (productId: string, variantId: string, input: UpdateProductVariantInput) =>
    apiFetch<{ variant: ProductVariant }>(`/api/products/${productId}/variants/${variantId}`, json("PATCH", input)).then((r) => r.variant),
  deleteVariant: (productId: string, variantId: string) => apiFetch<void>(`/api/products/${productId}/variants/${variantId}`, { method: "DELETE" }),

  listCategories: () => apiFetch<{ categories: CategoryNode[] }>("/api/catalog/categories").then((r) => r.categories),
  createCategory: (input: CreateProductCategoryInput) => apiFetch("/api/catalog/categories", json("POST", input)),
  updateCategory: (id: string, input: UpdateProductCategoryInput) => apiFetch(`/api/catalog/categories/${id}`, json("PATCH", input)),
  deleteCategory: (id: string) => apiFetch<void>(`/api/catalog/categories/${id}`, { method: "DELETE" }),

  listCollections: () => apiFetch<{ collections: CollectionView[] }>("/api/catalog/collections").then((r) => r.collections),
  createCollection: (input: CreateProductCollectionInput) => apiFetch("/api/catalog/collections", json("POST", input)),
  updateCollection: (id: string, input: UpdateProductCollectionInput) => apiFetch(`/api/catalog/collections/${id}`, json("PATCH", input)),
  deleteCollection: (id: string) => apiFetch<{ detachedFrom: number }>(`/api/catalog/collections/${id}`, { method: "DELETE" }),

  /** Uploads one image; resolves with the storage key to put on the product, and the URL to preview it. */
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ key: string; url: string }>("/api/media/images", { method: "POST", body: form });
  },
};
