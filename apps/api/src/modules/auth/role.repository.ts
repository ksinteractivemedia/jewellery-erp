import type { Role } from "@jewellery/types";
import { createRoleSchema, updateRoleSchema, type CreateRoleInput, type UpdateRoleInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { RoleModel } from "./role.model";

export async function createRole(input: CreateRoleInput): Promise<Role> {
  const parsed = createRoleSchema.parse(input);
  const doc = await RoleModel.create(parsed);
  return toDTO<Role>(doc)!;
}

export async function findRoleById(id: string): Promise<Role | null> {
  return toDTO<Role>(await RoleModel.findById(id));
}

export async function requireRoleById(id: string): Promise<Role> {
  const role = await findRoleById(id);
  if (!role) throw new NotFoundError("Role", id);
  return role;
}

export async function listRoles(filter: { isActive?: boolean } = {}): Promise<Role[]> {
  return toDTOList<Role>(await RoleModel.find(filter).sort({ name: 1 }));
}

export async function updateRole(id: string, input: UpdateRoleInput): Promise<Role> {
  const parsed = updateRoleSchema.parse(input);
  const doc = await RoleModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("Role", id);
  return toDTO<Role>(doc)!;
}
