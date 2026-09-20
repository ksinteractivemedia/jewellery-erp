import type { Id, Timestamps } from "./common";

export interface Role extends Timestamps {
  id: Id;
  name: string;
  description?: string;
  permissionIds: Id[];
  /** Built-in roles (e.g. "admin") can't be deleted from the UI once auth ships. */
  isSystem: boolean;
  isActive: boolean;
}
