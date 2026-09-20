import type { Schema } from "mongoose";
import { ImmutableRecordError } from "./errors";

/**
 * Enforces "append-only from the application perspective" at the Mongoose layer, not
 * just by convention — any attempt to update or delete an existing document throws,
 * whether it goes through `Model.updateOne`, `doc.save()` on an existing doc, or a
 * direct `deleteOne`/`deleteMany`. Used by InventoryLedger and Transaction
 * (business-rules.md §2.1, §6.3) and MetalRate (docs/data-model.md §3's history rule).
 */
export function appendOnlyPlugin(schema: Schema, options: { entityName: string }) {
  const { entityName } = options;

  const reject = () => {
    throw new ImmutableRecordError(entityName);
  };

  schema.pre("save", function (next) {
    if (!this.isNew) {
      reject();
      return;
    }
    next();
  });

  const blockedQueryOps = [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
    "replaceOne",
  ] as const;

  for (const op of blockedQueryOps) {
    schema.pre(op, { document: false, query: true }, () => reject());
  }

  schema.pre("deleteOne", { document: true, query: false }, () => reject());
}
