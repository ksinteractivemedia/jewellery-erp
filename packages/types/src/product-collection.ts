import type { Id, Timestamps } from "./common";

/** A curated, marketing-facing grouping ("Bridal Edit", "Festive"). A product can belong to many; a category is the single structural home. */
export interface ProductCollection extends Timestamps {
  id: Id;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}
