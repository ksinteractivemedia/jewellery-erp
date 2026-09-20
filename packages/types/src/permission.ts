import type { Id, Timestamps } from "./common";

/** Registry of grantable permissions. Roles reference these by id, not by free-text string. */
export interface Permission extends Timestamps {
  id: Id;
  /** e.g. "inventory.adjust" — `${module}.${action}`. The canonical list is PERMISSIONS in rbac.ts. */
  key: string;
  module: string;
  action: string;
  description?: string;
}
