import { z } from "zod";
import { zId } from "./common";
import { MAX_DASHBOARD_RANGE_DAYS, zDay } from "./dashboard";

/** One shared query shape for every report — a report ignores whatever it doesn't declare in its own `filters`. Same date-range discipline as the dashboard: a real calendar day, `from` not after `to`, and a bounded span. */
export const reportQuerySchema = z
  .object({
    from: zDay.optional(),
    to: zDay.optional(),
    branchId: zId.optional(),
    locationId: zId.optional(),
    customerType: z.enum(["B2C", "B2B"]).optional(),
    categoryId: zId.optional(),
    groupBy: z.string().trim().max(40).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(50),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "from must not be after to", path: ["from"] })
  .refine((q) => !q.from || !q.to || (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000 < MAX_DASHBOARD_RANGE_DAYS, {
    message: `a range can span at most ${MAX_DASHBOARD_RANGE_DAYS} days`,
    path: ["to"],
  });
export type ReportQueryInput = z.output<typeof reportQuerySchema>;
