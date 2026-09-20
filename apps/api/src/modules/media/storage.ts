import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { IMAGE_KEY_PATTERN } from "@jewellery/validation";

export interface StoredObject {
  bytes: Buffer;
  contentType: string;
}

/**
 * The storage port. Product code only ever holds opaque keys; where the bytes live is this
 * interface's business — local disk in dev, an S3-compatible bucket in production (that
 * adapter is the only thing to write when deploying; nothing else changes).
 */
export interface MediaStorage {
  put(key: string, object: StoredObject): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  exists(key: string): Promise<boolean>;
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
export const contentTypeForKey = (key: string) => CONTENT_TYPE_BY_EXT[key.split(".").pop() ?? ""];

/** Keys reach the filesystem, so they are re-validated here — defence in depth against path traversal. */
function assertSafeKey(key: string) {
  if (!IMAGE_KEY_PATTERN.test(key) || key.includes("..")) throw new Error(`unsafe storage key: ${key}`);
}

export function createLocalDiskStorage(rootDir: string): MediaStorage {
  const root = path.resolve(rootDir);
  const resolve = (key: string) => {
    assertSafeKey(key);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error(`unsafe storage key: ${key}`);
    return full;
  };
  return {
    async put(key, object) {
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, object.bytes);
    },
    async get(key) {
      try {
        const contentType = contentTypeForKey(key);
        return contentType ? { bytes: await readFile(resolve(key)), contentType } : null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async exists(key) {
      try {
        return (await stat(resolve(key))).isFile();
      } catch {
        return false;
      }
    },
  };
}

export function createMemoryStorage(): MediaStorage & { size(): number } {
  const objects = new Map<string, StoredObject>();
  return {
    async put(key, object) {
      assertSafeKey(key);
      objects.set(key, object);
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
    async exists(key) {
      return objects.has(key);
    },
    size: () => objects.size,
  };
}
