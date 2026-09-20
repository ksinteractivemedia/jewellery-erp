import type { CustomerGroup } from "@jewellery/types";
import {
  createCustomerGroupSchema,
  updateCustomerGroupSchema,
  type CreateCustomerGroupInput,
  type UpdateCustomerGroupInput,
} from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { CustomerGroupModel } from "./customer-group.model";

export async function createCustomerGroup(input: CreateCustomerGroupInput): Promise<CustomerGroup> {
  const parsed = createCustomerGroupSchema.parse(input);
  const doc = await CustomerGroupModel.create(parsed);
  return toDTO<CustomerGroup>(doc)!;
}

export async function findCustomerGroupById(id: string): Promise<CustomerGroup | null> {
  return toDTO<CustomerGroup>(await CustomerGroupModel.findById(id));
}

export async function requireCustomerGroupById(id: string): Promise<CustomerGroup> {
  const group = await findCustomerGroupById(id);
  if (!group) throw new NotFoundError("CustomerGroup", id);
  return group;
}

export async function listCustomerGroups(filter: { isActive?: boolean } = {}): Promise<CustomerGroup[]> {
  return toDTOList<CustomerGroup>(await CustomerGroupModel.find(filter).sort({ name: 1 }));
}

export async function updateCustomerGroup(id: string, input: UpdateCustomerGroupInput): Promise<CustomerGroup> {
  const parsed = updateCustomerGroupSchema.parse(input);
  const doc = await CustomerGroupModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("CustomerGroup", id);
  return toDTO<CustomerGroup>(doc)!;
}
