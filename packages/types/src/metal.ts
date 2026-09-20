import type { Id, Timestamps } from "./common";

/** One recognized purity standard for a metal, e.g. { code: "22K", fineness: 0.916 }. */
export interface PurityOption {
  code: string;
  /** Fraction of pure metal, 0–1 (22K gold = 0.916). */
  fineness: number;
  label?: string;
  isActive: boolean;
}

/** Reference data: GOLD, SILVER, PLATINUM, ... — never a hardcoded enum, so a new metal/purity is a data change, not a code change. */
export interface Metal extends Timestamps {
  id: Id;
  code: string;
  name: string;
  symbol?: string;
  purityOptions: PurityOption[];
  isActive: boolean;
}
