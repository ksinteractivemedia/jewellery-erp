import type { Permission } from "@jewellery/types";
import { createPermissionSchema, updatePermissionSchema, type CreatePermissionInput, type UpdatePermissionInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { PermissionModel } from "./permission.model";

export async function createPermission(input: CreatePermissionInput): Promise<Permission> {
  const parsed = createPermissionSchema.parse(input);
  const doc = await PermissionModel.create(parsed);
  return toDTO<Permission>(doc)!;
}

export async function findPermissionById(id: string): Promise<Permission | null> {
  return toDTO<Permission>(await PermissionModel.findById(id));
}

export async function findPermissionsByKeys(keys: string[]): Promise<Permission[]> {
  return toDTOList<Permission>(await PermissionModel.find({ key: { $in: keys } }));
}

export async function listPermissions(filter: { module?: string } = {}): Promise<Permission[]> {
  return toDTOList<Permission>(await PermissionModel.find(filter).sort({ module: 1, action: 1 }));
}

export async function updatePermission(id: string, input: UpdatePermissionInput): Promise<Permission> {
  const parsed = updatePermissionSchema.parse(input);
  const doc = await PermissionModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("Permission", id);
  return toDTO<Permission>(doc)!;
}
