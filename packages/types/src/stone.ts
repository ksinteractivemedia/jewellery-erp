import type { Id, Timestamps } from "./common";

export type StoneCategory = "PRECIOUS" | "SEMI_PRECIOUS" | "ORGANIC";
export type StoneUnit = "CARAT" | "GRAM" | "PIECE";

/** Master data for a stone type (Diamond, Ruby, Emerald, Pearl, ...). */
export interface Stone extends Timestamps {
  id: Id;
  name: string;
  category: StoneCategory;
  defaultUnit: StoneUnit;
  isActive: boolean;
}
