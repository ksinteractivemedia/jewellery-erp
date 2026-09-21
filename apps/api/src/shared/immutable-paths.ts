import type { Query, Schema } from "mongoose";
import { ImmutableRecordError } from "./errors";

/**
 * Freezes the named top-level paths of a document once it exists: any update or save that touches them throws. For records whose
 * commercial content (lines, prices, totals, parties) must never change after they are issued, while their status and links
 * legitimately do. Corrections are new documents, never edits (business-rules.md §8.2).
 */
export function freezePaths(schema: Schema, paths: readonly string[], entity: string, opts: { allowDelete?: boolean } = {}) {
  const frozen = (key: string) => paths.includes(key.split(".")[0]!);
  const reject = () => new ImmutableRecordError(`${entity} (${paths.slice(0, 4).join(", ")}…)`);
  schema.pre("save", function (next) {
    if (!this.isNew && this.modifiedPaths().some(frozen)) return next(reject());
    next();
  });
  for (const op of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"] as const) {
    schema.pre(op, { document: false, query: true }, function (this: Query<unknown, unknown>, next) {
      const update = (this.getUpdate() ?? {}) as Record<string, unknown>;
      const keys = Object.entries(update).flatMap(([k, v]) => (k.startsWith("$") && v && typeof v === "object" ? Object.keys(v) : [k]));
      if (keys.some(frozen)) return next(reject());
      next();
    });
  }
  if (!opts.allowDelete) {
    for (const op of ["deleteOne", "deleteMany", "findOneAndDelete"] as const) {
      schema.pre(op, { document: false, query: true }, () => {
        throw new ImmutableRecordError(entity);
      });
    }
  }
}
