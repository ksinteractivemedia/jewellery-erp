/**
 * Cross-entity primitives. No runtime code, no Mongoose — see architecture.md §2.
 * Ids are plain strings here (Mongoose ObjectId <-> string mapping happens at the
 * apps/api boundary); every other package and the frontends only ever see strings.
 */

export type Id = string;

/** Integer paise — never a float. See docs/data-model.md for why money is never Decimal128. */
export type Paise = number;

/** Grams, up to 3 decimal places. Plain `number` is precise enough at jewellery-shop scale. */
export type Grams = number;

/** 0–100. */
export type Percent = number;

export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

export type Channel = "ERP" | "B2C" | "B2B";

export type CustomerType = "B2C" | "B2B";

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * A stone's contribution to a piece — used both as a design-level default on `Product`
 * and as the actual recorded stones on a physical `InventoryItem`. Weight is in carats.
 */
export interface StoneDetail {
  stoneId?: Id;
  name: string;
  caratWeight: number;
  quantity: number;
  quality?: string;
  certificateNumber?: string;
}
