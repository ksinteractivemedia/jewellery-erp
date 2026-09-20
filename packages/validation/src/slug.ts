import { z } from "zod";

/**
 * URL slug from free text: strips diacritics, lowercases, collapses every run of
 * non-alphanumerics to one hyphen. Shared so the ERP form can preview exactly what the API
 * will store — the API remains the source of truth (it re-derives and checks uniqueness).
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

export const zSlug = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lowercase letters, numbers and single hyphens");
