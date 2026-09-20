import type { Customer } from "@jewellery/types";
import { createCustomerSchema, updateCustomerSchema, type CreateCustomerInput, type UpdateCustomerInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { CustomerModel } from "./customer.model";

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const parsed = createCustomerSchema.parse(input);
  const doc = await CustomerModel.create(parsed);
  return toDTO<Customer>(doc)!;
}

export async function findCustomerById(id: string): Promise<Customer | null> {
  return toDTO<Customer>(await CustomerModel.findById(id));
}

export async function requireCustomerById(id: string): Promise<Customer> {
  const customer = await findCustomerById(id);
  if (!customer) throw new NotFoundError("Customer", id);
  return customer;
}

export async function listCustomers(
  filter: { type?: "B2C" | "B2B"; customerGroupId?: string; isActive?: boolean } = {}
): Promise<Customer[]> {
  return toDTOList<Customer>(await CustomerModel.find(filter).sort({ name: 1 }));
}

export async function updateCustomer(id: string, input: UpdateCustomerInput): Promise<Customer> {
  const parsed = updateCustomerSchema.parse(input);
  const doc = await CustomerModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("Customer", id);
  return toDTO<Customer>(doc)!;
}
