import type { SchemaOptions } from "mongoose";

/**
 * Standard `toJSON`/`toObject` transform: `_id` -> `id` (string), drop `__v`, so every
 * model's serialized shape matches the plain interfaces in packages/types.
 */
function toDomainShape(_doc: unknown, ret: Record<string, unknown>) {
  ret.id = String(ret._id);
  delete ret._id;
  delete ret.__v;
  return ret;
}

/**
 * Base options every model should spread in. Generic + double-cast because Mongoose 8's
 * `SchemaOptions<T, ...>` has enough interdependent generic parameters (Model/Document/
 * statics) that a shared helper can never structurally satisfy every call site's exact
 * instantiation — the runtime shape is correct regardless, so we assert it once here
 * instead of fighting variance in every model file.
 */
export function baseSchemaOptions<T = unknown>(overrides: Record<string, unknown> = {}): SchemaOptions<T> {
  return {
    timestamps: true,
    toJSON: { virtuals: true, flattenMaps: true, transform: toDomainShape },
    toObject: { virtuals: true, flattenMaps: true, transform: toDomainShape },
    ...overrides,
  } as unknown as SchemaOptions<T>;
}

/** For append-only entities (Transaction, InventoryLedger, MetalRate): `createdAt` only, no `updatedAt`. */
export function createdAtOnlySchemaOptions<T = unknown>(overrides: Record<string, unknown> = {}): SchemaOptions<T> {
  return baseSchemaOptions<T>({ timestamps: { createdAt: true, updatedAt: false }, ...overrides });
}
