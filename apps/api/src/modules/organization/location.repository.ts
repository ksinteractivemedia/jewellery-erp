import type { Location } from "@jewellery/types";
import { createLocationSchema, updateLocationSchema, type CreateLocationInput, type UpdateLocationInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { LocationModel } from "./location.model";

export async function createLocation(input: CreateLocationInput): Promise<Location> {
  const parsed = createLocationSchema.parse(input);
  const doc = await LocationModel.create(parsed);
  return toDTO<Location>(doc)!;
}

export async function findLocationById(id: string): Promise<Location | null> {
  return toDTO<Location>(await LocationModel.findById(id));
}

export async function requireLocationById(id: string): Promise<Location> {
  const location = await findLocationById(id);
  if (!location) throw new NotFoundError("Location", id);
  return location;
}

export async function listLocations(filter: { branchId?: string; type?: string; isActive?: boolean } = {}): Promise<Location[]> {
  const docs = await LocationModel.find(filter).sort({ name: 1 });
  return toDTOList<Location>(docs);
}

export async function updateLocation(id: string, input: UpdateLocationInput): Promise<Location> {
  const parsed = updateLocationSchema.parse(input);
  const doc = await LocationModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("Location", id);
  return toDTO<Location>(doc)!;
}
