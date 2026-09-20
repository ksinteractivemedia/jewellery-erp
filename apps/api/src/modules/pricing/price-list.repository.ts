import type { PriceList } from "@jewellery/types";
import { createPriceListSchema, renamePriceListSchema, type CreatePriceListInput, type RenamePriceListInput } from "@jewellery/validation";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { PriceListModel } from "./price-list.model";

/** Creates version 1 of a new price list code. Use `createNewVersion` for later versions. */
export async function createPriceList(input: CreatePriceListInput): Promise<PriceList> {
  const parsed = createPriceListSchema.parse(input);
  const existing = await PriceListModel.exists({ code: parsed.code.toUpperCase() });
  if (existing) throw new ConflictError(`price list code '${parsed.code}' already exists — use createNewVersion`);
  const doc = await PriceListModel.create({ ...parsed, version: 1 });
  return toDTO<PriceList>(doc)!;
}

/**
 * Versioning contract (business-rules.md §7.2's sibling rule for pricing documents):
 * editing a live price list never mutates it — it closes the current version
 * (`effectiveTo` = the new version's `effectiveFrom`) and inserts a new one with
 * `version + 1`. Both writes happen atomically.
 */
export async function createNewVersion(code: string, effectiveFrom: Date, name?: string): Promise<PriceList> {
  const current = await PriceListModel.findOne({ code: code.toUpperCase() }).sort({ version: -1 });
  if (!current) throw new NotFoundError("PriceList", code);
  if (effectiveFrom <= current.effectiveFrom) {
    throw new ConflictError("a new version's effectiveFrom must be after the current version's");
  }

  const session = await PriceListModel.startSession();
  try {
    let created!: PriceList;
    await session.withTransaction(async () => {
      current.effectiveTo = effectiveFrom;
      await current.save({ session });

      const [doc] = await PriceListModel.create(
        [
          {
            code: current.code,
            name: name ?? current.name,
            version: current.version + 1,
            customerGroupId: current.customerGroupId,
            customerId: current.customerId,
            channel: current.channel,
            effectiveFrom,
            isActive: true,
          },
        ],
        { session }
      );
      created = toDTO<PriceList>(doc)!;
    });
    return created;
  } finally {
    await session.endSession();
  }
}

export async function findCurrentPriceList(code: string, asOf: Date = new Date()): Promise<PriceList | null> {
  return toDTO<PriceList>(
    await PriceListModel.findOne({
      code: code.toUpperCase(),
      effectiveFrom: { $lte: asOf },
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: { $gt: asOf } }],
    }).sort({ version: -1 })
  );
}

export async function listPriceListVersions(code: string): Promise<PriceList[]> {
  return toDTOList<PriceList>(await PriceListModel.find({ code: code.toUpperCase() }).sort({ version: 1 }));
}

export async function renameCurrentPriceList(id: string, input: RenamePriceListInput): Promise<PriceList> {
  const parsed = renamePriceListSchema.parse(input);
  const doc = await PriceListModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("PriceList", id);
  return toDTO<PriceList>(doc)!;
}
