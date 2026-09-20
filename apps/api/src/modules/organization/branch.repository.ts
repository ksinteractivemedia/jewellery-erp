import type { Branch } from "@jewellery/types";
import { createBranchSchema, updateBranchSchema, type CreateBranchInput, type UpdateBranchInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { BranchModel } from "./branch.model";

export async function createBranch(input: CreateBranchInput): Promise<Branch> {
  const parsed = createBranchSchema.parse(input);
  const doc = await BranchModel.create(parsed);
  return toDTO<Branch>(doc)!;
}

export async function findBranchById(id: string): Promise<Branch | null> {
  return toDTO<Branch>(await BranchModel.findById(id));
}

export async function requireBranchById(id: string): Promise<Branch> {
  const branch = await findBranchById(id);
  if (!branch) throw new NotFoundError("Branch", id);
  return branch;
}

export async function listBranches(filter: { companyId?: string; isActive?: boolean } = {}): Promise<Branch[]> {
  const docs = await BranchModel.find(filter).sort({ name: 1 });
  return toDTOList<Branch>(docs);
}

export async function updateBranch(id: string, input: UpdateBranchInput): Promise<Branch> {
  const parsed = updateBranchSchema.parse(input);
  const doc = await BranchModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("Branch", id);
  return toDTO<Branch>(doc)!;
}
