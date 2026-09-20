import { Types, type Document } from "mongoose";

/**
 * Every ref field is stored as a Mongoose `ObjectId` at runtime but typed as `string`
 * in packages/types (the public DTO shape) — this walks the plain object returned by
 * `toObject()` and stringifies every ObjectId so the two actually match.
 */
export function deepStringifyObjectIds<T>(value: T): T {
  if (value instanceof Types.ObjectId) return value.toString() as unknown as T;
  if (Array.isArray(value)) return value.map((item) => deepStringifyObjectIds(item)) as unknown as T;
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = deepStringifyObjectIds(nested);
    }
    return result as T;
  }
  return value;
}

/** Converts a hydrated Mongoose document to its public DTO shape (packages/types). */
export function toDTO<T>(doc: Document | null): T | null {
  if (!doc) return null;
  return deepStringifyObjectIds(doc.toObject() as T);
}

export function toDTOList<T>(docs: Document[]): T[] {
  return docs.map((doc) => deepStringifyObjectIds(doc.toObject() as T));
}
