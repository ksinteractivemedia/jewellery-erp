import { Schema, model, type Model } from "mongoose";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export interface NewsletterSubscriptionAttrs {
  email: string;
  source: string;
  consentedAt: Date;
}

/** Someone who asked, on the storefront, to hear from the brand. One row per address; nothing is sent from here. */
const newsletterSchema = new Schema<NewsletterSubscriptionAttrs>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    source: { type: String, required: true, default: "storefront" },
    consentedAt: { type: Date, required: true },
  },
  baseSchemaOptions<NewsletterSubscriptionAttrs>()
);

export const NewsletterSubscriptionModel: Model<NewsletterSubscriptionAttrs> = model<NewsletterSubscriptionAttrs>("NewsletterSubscription", newsletterSchema);
