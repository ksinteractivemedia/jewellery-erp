import { randomUUID } from "node:crypto";
import { requireImage } from "./image-validation";
import type { MediaStorage } from "./storage";

export interface UploadedImage {
  key: string;
  contentType: string;
  size: number;
}

export function createMediaService(storage: MediaStorage, publicBaseUrl: string) {
  const base = publicBaseUrl.replace(/\/+$/, "");
  return {
    /** Stores validated image bytes under a server-generated key. */
    async uploadImage(bytes: Buffer): Promise<UploadedImage> {
      const { ext, contentType } = requireImage(bytes);
      const key = `products/${randomUUID()}.${ext}`;
      await storage.put(key, { bytes, contentType });
      return { key, contentType, size: bytes.length };
    },
    urlFor: (key: string) => `${base}/api/media/${key}`,
    exists: (key: string) => storage.exists(key),
    get: (key: string) => storage.get(key),
  };
}
export type MediaService = ReturnType<typeof createMediaService>;
