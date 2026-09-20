import type { Supplier } from "@jewellery/types";
import { createSupplierSchema, updateSupplierSchema, type CreateSupplierInput, type UpdateSupplierInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { SupplierModel } from "./supplier.model";

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  const parsed = createSupplierSchema.parse(input);
  const doc = await SupplierModel.create(parsed);
  return toDTO<Supplier>(doc)!;
}

export async function findSupplierById(id: string): Promise<Supplier | null> {
  return toDTO<Supplier>(await SupplierModel.findById(id));
}

export async function requireSupplierById(id: string): Promise<Supplier> {
  const supplier = await findSupplierById(id);
  if (!supplier) throw new NotFoundError("Supplier", id);
  return supplier;
}

export async function listSuppliers(filter: { isActive?: boolean } = {}): Promise<Supplier[]> {
  return toDTOList<Supplier>(await SupplierModel.find(filter).sort({ name: 1 }));
}

export async function updateSupplier(id: string, input: UpdateSupplierInput): Promise<Supplier> {
  const parsed = updateSupplierSchema.parse(input);
  const doc = await SupplierModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("Supplier", id);
  return toDTO<Supplier>(doc)!;
}
