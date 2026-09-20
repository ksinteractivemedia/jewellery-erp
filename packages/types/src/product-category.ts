import type { Id, Timestamps } from "./common";

/** Tree structure for merchandising/navigation. Not to be confused with a MongoDB "collection". */
export interface ProductCategory extends Timestamps {
  id: Id;
  name: string;
  slug: string;
  parentId?: Id;
  isActive: boolean;
}
