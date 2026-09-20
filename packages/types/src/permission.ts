import type { Id, Timestamps } from "./common";

/** Registry of grantable permissions. Roles reference these by id, not by free-text string. */
export interface Permission extends Timestamps {
  id: Id;
  /** e.g. "inventory:write", "orders:approve" — `${module}:${action}` */
  key: string;
  module: string;
  action: string;
  description?: string;
}
