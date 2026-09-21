import { Schema, model, type Model } from "mongoose";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

/**
 * The storefront's editorial content: announcement, hero, story, trust points, policies and curation. A single
 * document (`key: "default"`). It is DATA a merchandiser owns, not code — so no promise, policy or story is ever
 * hardcoded into the storefront. The shape is validated by `storefrontContentSchema`; an empty or missing document
 * simply means an unadorned storefront.
 */
export interface StorefrontContentAttrs {
  key: string;
  content: Record<string, unknown>;
}

const storefrontContentSchema = new Schema<StorefrontContentAttrs>(
  { key: { type: String, required: true, unique: true }, content: { type: Schema.Types.Mixed, required: true } },
  baseSchemaOptions<StorefrontContentAttrs>({ minimize: false })
);

export const StorefrontContentModel: Model<StorefrontContentAttrs> = model<StorefrontContentAttrs>("StorefrontContent", storefrontContentSchema);
