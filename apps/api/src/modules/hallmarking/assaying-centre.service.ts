import type { AssayingCentre } from "@jewellery/types";
import type { CreateAssayingCentreInput, UpdateAssayingCentreInput } from "@jewellery/validation";
import { DomainValidationError, NotFoundError } from "../../shared/errors";
import { requireLocationById } from "../organization/location.repository";
import { assayingCentreView } from "./hallmarking-views";
import { oid } from "./hallmarking-store";
import { AssayingCentreModel } from "./hallmarking.models";

/** Assaying centres are reference data, entered once by an ERP admin — never a hardcoded list, so a new centre or one that closes is a data change, not a code change. */
export async function createAssayingCentre(input: CreateAssayingCentreInput): Promise<AssayingCentre> {
  const location = await requireLocationById(input.locationId);
  if (location.type !== "HALLMARKING_CENTER") throw new DomainValidationError(`${location.name} is not a hallmarking centre location.`);
  const doc = await AssayingCentreModel.create({
    name: input.name,
    code: input.code,
    ...(input.bisRegistrationNumber ? { bisRegistrationNumber: input.bisRegistrationNumber } : {}),
    locationId: oid(input.locationId),
    locationName: location.name,
    ...(input.address ? { address: input.address } : {}),
    ...(input.contactPhone ? { contactPhone: input.contactPhone } : {}),
    ...(input.contactEmail ? { contactEmail: input.contactEmail } : {}),
    isActive: input.isActive,
  });
  return assayingCentreView(doc.toObject());
}

export async function updateAssayingCentre(id: string, input: UpdateAssayingCentreInput): Promise<AssayingCentre> {
  const set: Record<string, unknown> = { ...input };
  if (input.locationId) {
    const location = await requireLocationById(input.locationId);
    if (location.type !== "HALLMARKING_CENTER") throw new DomainValidationError(`${location.name} is not a hallmarking centre location.`);
    set.locationId = oid(input.locationId);
    set.locationName = location.name;
  }
  const doc = await AssayingCentreModel.findByIdAndUpdate(id, set, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("Assaying centre", id);
  return assayingCentreView(doc.toObject());
}

export async function requireAssayingCentre(id: string) {
  const doc = await AssayingCentreModel.findById(id);
  if (!doc) throw new NotFoundError("Assaying centre", id);
  return doc;
}
export async function getAssayingCentre(id: string): Promise<AssayingCentre> {
  return assayingCentreView((await requireAssayingCentre(id)).toObject());
}
export async function listAssayingCentres(filter: { isActive?: boolean } = {}): Promise<AssayingCentre[]> {
  const docs = await AssayingCentreModel.find(filter).sort({ name: 1 }).lean();
  return docs.map((d) => assayingCentreView(d as never));
}
