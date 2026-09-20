import type { Company } from "@jewellery/types";
import { createCompanySchema, updateCompanySchema, type CreateCompanyInput, type UpdateCompanyInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { CompanyModel } from "./company.model";

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const parsed = createCompanySchema.parse(input);
  const doc = await CompanyModel.create(parsed);
  return toDTO<Company>(doc)!;
}

export async function findCompanyById(id: string): Promise<Company | null> {
  const doc = await CompanyModel.findById(id);
  return toDTO<Company>(doc);
}

export async function requireCompanyById(id: string): Promise<Company> {
  const company = await findCompanyById(id);
  if (!company) throw new NotFoundError("Company", id);
  return company;
}

export async function listCompanies(filter: { isActive?: boolean } = {}): Promise<Company[]> {
  const docs = await CompanyModel.find(filter).sort({ name: 1 });
  return toDTOList<Company>(docs);
}

export async function updateCompany(id: string, input: UpdateCompanyInput): Promise<Company> {
  const parsed = updateCompanySchema.parse(input);
  const doc = await CompanyModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("Company", id);
  return toDTO<Company>(doc)!;
}
