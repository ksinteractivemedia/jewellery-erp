import type { MetadataRoute } from "next";
import { storeGet } from "../lib/api";
import { absoluteUrl } from "../lib/site";

export const dynamic = "force-dynamic";
interface SitemapData { products: { slug: string; updatedAt: string }[]; categories: { slug: string; updatedAt: string }[]; collections: { slug: string; updatedAt: string }[] }

/** Only live pages: what the API says is on sale. If the API is unreachable, the static pages alone are listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await storeGet<SitemapData>("/sitemap").catch(() => ({ products: [], categories: [], collections: [] }) as SitemapData);
  const entry = (path: string, lastModified?: string, changeFrequency?: "daily" | "weekly", priority?: number) => ({ url: absoluteUrl(path), ...(lastModified ? { lastModified } : {}), ...(changeFrequency ? { changeFrequency } : {}), ...(priority ? { priority } : {}) });
  return [
    entry("/", undefined, "daily", 1),
    entry("/collections", undefined, "weekly", 0.8),
    ...data.collections.map((c) => entry(`/collections/${c.slug}`, c.updatedAt, "weekly", 0.7)),
    ...data.categories.map((c) => entry(`/category/${c.slug}`, c.updatedAt, "daily", 0.8)),
    ...data.products.map((p) => entry(`/product/${p.slug}`, p.updatedAt, "daily", 0.6)),
  ];
}
