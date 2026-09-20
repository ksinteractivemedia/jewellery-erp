import { ALL_ROLE_NAMES } from "@jewellery/types";
import { PermissionModel } from "../permission.model";
import { RoleModel } from "../role.model";
import { PERMISSION_DESCRIPTIONS, splitPermissionKey } from "./permission-catalog";
import { DEFAULT_ROLE_MATRIX, ROLE_DESCRIPTIONS } from "./role-matrix";

/**
 * Idempotent: makes the database match the code-defined catalog and system-role matrix.
 * Run at every boot. Permissions are upserted; system roles are overwritten to the matrix
 * (so hand edits to a system role never survive a restart); custom roles are never touched.
 */
export async function syncRbac(): Promise<{ permissions: number; roles: number }> {
  const entries = Object.entries(PERMISSION_DESCRIPTIONS);
  await PermissionModel.bulkWrite(
    entries.map(([key, description]) => ({
      updateOne: { filter: { key }, update: { $set: { ...splitPermissionKey(key), description }, $setOnInsert: { key } }, upsert: true },
    }))
  );

  const permissions = await PermissionModel.find({ key: { $in: entries.map(([k]) => k) } }).select("key");
  const idByKey = new Map(permissions.map((p) => [p.key, p._id]));

  await RoleModel.bulkWrite(
    ALL_ROLE_NAMES.map((name) => ({
      updateOne: {
        filter: { name },
        update: {
          $set: {
            description: ROLE_DESCRIPTIONS[name],
            isSystem: true,
            isActive: true,
            permissionIds: DEFAULT_ROLE_MATRIX[name].map((key) => idByKey.get(key)!),
          },
          $setOnInsert: { name },
        },
        upsert: true,
      },
    }))
  );

  return { permissions: entries.length, roles: ALL_ROLE_NAMES.length };
}
