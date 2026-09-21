import type { RequestHandler } from "express";
import { AuthorizationError } from "../../shared/errors";
import { UserModel } from "../../modules/auth/user.model";
import { asyncHandler } from "./async-handler";
import "../context";

/**
 * The wholesale portal's authorization. A buyer is authorised by WHO THEY ARE — a B2B_BUYER login linked to one customer account —
 * and every query downstream is scoped to that customer id, taken from the database, never from the request. There is no way to
 * name another customer. Staff logins (no customer link) are refused here: they use the ERP API and its permissions instead.
 * Mount after `authenticate`.
 */
export const requireBuyer: RequestHandler = asyncHandler(async (req, _res, next) => {
  if (req.auth?.userType !== "B2B_BUYER") throw new AuthorizationError("This area is for wholesale customers.");
  const user = await UserModel.findById(req.auth.userId).select("customerId name email isActive").lean();
  if (!user?.isActive || !user.customerId) throw new AuthorizationError("This login isn't linked to a wholesale account.");
  req.buyer = { customerId: String(user.customerId), actor: { id: req.auth.userId, name: user.name, ...(user.email ? { email: user.email } : {}), kind: "CUSTOMER" } };
  next();
});
