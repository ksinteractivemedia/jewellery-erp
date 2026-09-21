import { Types } from "mongoose";
import { DomainValidationError, NotFoundError } from "../../shared/errors";
import { BranchModel } from "../organization/branch.model";
import { LocationModel } from "../organization/location.model";

export interface LocationScope {
  /** Locations in scope; undefined = everywhere. */
  locationIds?: Types.ObjectId[];
  /** The branch the filter resolves to — for a single location, the branch it belongs to. */
  branchId?: string;
  locationId?: string;
}

/**
 * Turns the dashboard's branch/location filter into the set of locations queries use. A location wins over its
 * branch; a location that isn't in the named branch is a mistake worth refusing, and an unknown id is a 404 (a
 * stale bookmark should say so, not quietly show an empty dashboard).
 */
export async function resolveScope(filter: { branchId?: string; locationId?: string }): Promise<LocationScope> {
  if (filter.locationId) {
    const location = await LocationModel.findById(filter.locationId).select("branchId").lean();
    if (!location) throw new NotFoundError("Location", filter.locationId);
    if (filter.branchId && String(location.branchId) !== filter.branchId) throw new DomainValidationError("that location does not belong to that branch");
    return { locationIds: [new Types.ObjectId(filter.locationId)], branchId: String(location.branchId), locationId: filter.locationId };
  }
  if (filter.branchId) {
    if (!(await BranchModel.exists({ _id: filter.branchId }))) throw new NotFoundError("Branch", filter.branchId);
    const locations = await LocationModel.find({ branchId: filter.branchId }).select("_id").lean();
    return { locationIds: locations.map((l) => l._id), branchId: filter.branchId };
  }
  return {};
}

/** `{ locationId: { $in } }` for an item query, or nothing when the whole business is in scope. */
export const itemScope = (scope: LocationScope) => (scope.locationIds ? { locationId: { $in: scope.locationIds } } : {});
