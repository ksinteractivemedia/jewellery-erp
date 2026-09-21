import type { StoreDeliveryOption } from "@jewellery/types";
import { storefrontContentSchema } from "@jewellery/validation";
import { StorefrontContentModel } from "../storefront/storefront-content.model";

/** The parts of the storefront's editorial data checkout depends on: which HSN it is taxed under and how it can be delivered. */
export async function loadStoreSettings(): Promise<{ hsnCode: string | null; deliveryOptions: StoreDeliveryOption[] }> {
  const doc = await StorefrontContentModel.findOne({ key: "default" }).lean();
  const parsed = doc ? storefrontContentSchema.safeParse(doc.content) : null;
  if (!parsed?.success) return { hsnCode: null, deliveryOptions: [] };
  return {
    hsnCode: parsed.data.pricing?.hsnCode ?? null,
    deliveryOptions: parsed.data.deliveryOptions.map((o) => ({ code: o.code, label: o.label, fee: o.fee, ...(o.estimate ? { estimate: o.estimate } : {}) })),
  };
}
