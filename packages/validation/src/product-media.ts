import { z } from "zod";

/**
 * Storage keys are opaque and API-generated (`products/<uuid>.<ext>`). Validating the shape
 * on every write means a client can't point a product at an arbitrary path or external URL.
 */
export const IMAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9_-]+)*\.(png|jpg|webp)$/;

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMAGES = 12;
export const MAX_PRODUCT_VIDEOS = 5;
export const MAX_PRODUCT_TAGS = 20;

export const zImageKey = z.string().max(200).regex(IMAGE_KEY_PATTERN, "invalid image key");

export const zProductImage = z.object({
  key: zImageKey,
  alt: z.string().trim().max(200).optional(),
});

export const zVideoUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => u.startsWith("https://"), "video links must use https");

export const zTag = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(30)
  .regex(/^[a-z0-9][a-z0-9 _-]*$/, "tags may contain letters, numbers, spaces, hyphens and underscores");

/** Tags are normalised (trimmed, lowercased) and de-duplicated, preserving first-seen order. */
export const zTags = z
  .array(zTag)
  .max(MAX_PRODUCT_TAGS)
  .transform((tags) => [...new Set(tags)]);
