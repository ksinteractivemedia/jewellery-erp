import { z } from "zod";
import { zId } from "./common";

const isRealDay = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
/** A calendar day, YYYY-MM-DD — a day, not an instant, so no timezone can shift it. */
export const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD").refine(isRealDay, "not a real calendar date");

export const MAX_DASHBOARD_RANGE_DAYS = 366;

/**
 * Dashboard filters, shared by every section endpoint. `from`/`to` are inclusive business days (the API
 * turns them into instants in the business timezone); when both are left out the range defaults to the last
 * 30 days. `locationId` narrows to one location; `branchId` to every location of a branch.
 */
export const dashboardQuerySchema = z
  .object({
    from: zDay.optional(),
    to: zDay.optional(),
    branchId: zId.optional(),
    locationId: zId.optional(),
  })
  .refine((q) => (q.from === undefined) === (q.to === undefined), { message: "give both from and to, or neither", path: ["to"] })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "from must not be after to", path: ["from"] })
  .refine((q) => !q.from || !q.to || (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000 < MAX_DASHBOARD_RANGE_DAYS, {
    message: `a range can span at most ${MAX_DASHBOARD_RANGE_DAYS} days`,
    path: ["to"],
  });
export type DashboardQuery = z.output<typeof dashboardQuerySchema>;
