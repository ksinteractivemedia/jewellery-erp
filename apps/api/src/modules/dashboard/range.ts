/**
 * Business days. A dashboard "day" is a calendar day in the business's timezone, not in UTC, or "today's
 * revenue" would flip at 5:30 a.m. IST. The business runs in India, which has no daylight saving, so a fixed
 * offset is exact; when companies get a configurable timezone this constant becomes a lookup.
 */
export const BUSINESS_UTC_OFFSET_MINUTES = 330;

const OFFSET_MS = BUSINESS_UTC_OFFSET_MINUTES * 60_000;
const DAY_MS = 86_400_000;
const utcMidnight = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** The business day (YYYY-MM-DD) an instant falls on. */
export const businessDay = (instant: Date): string => new Date(instant.getTime() + OFFSET_MS).toISOString().slice(0, 10);
/** The instant a business day begins. */
export const dayStart = (day: string): Date => new Date(utcMidnight(day) - OFFSET_MS);
export const addDays = (day: string, n: number): string => new Date(utcMidnight(day) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string): number => Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);

/** The Monday on or before a day. */
export function weekStart(day: string): string {
  const weekday = new Date(utcMidnight(day)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

export interface ResolvedRange {
  /** First and last business day, inclusive. */
  from: string;
  to: string;
  /** [start, end) as instants. */
  start: Date;
  end: Date;
  days: number;
}

const rangeOf = (from: string, to: string): ResolvedRange => ({ from, to, start: dayStart(from), end: dayStart(addDays(to, 1)), days: daysBetween(from, to) + 1 });

/** The requested range, or — when none was given — the last 30 business days ending today. */
export function resolveRange(q: { from?: string; to?: string }, now: Date): ResolvedRange {
  const to = q.to ?? businessDay(now);
  return rangeOf(q.from ?? addDays(to, -29), to);
}

/** The equally long period immediately before `range` — what a KPI is compared against. */
export function previousRange(range: ResolvedRange): ResolvedRange {
  const to = addDays(range.from, -1);
  return rangeOf(addDays(to, -(range.days - 1)), to);
}

export type Granularity = "day" | "week";
/** Daily points up to 45 days, weekly beyond — a chart with a hundred bars says nothing. */
export const granularityFor = (range: ResolvedRange): Granularity => (range.days <= 45 ? "day" : "week");

/** Every bucket a chart over `range` needs, in order, including empty ones — a quiet day is a zero, not a gap. */
export function bucketKeys(range: ResolvedRange, granularity: Granularity): string[] {
  const keys: string[] = [];
  for (let day = granularity === "week" ? weekStart(range.from) : range.from; day <= range.to; day = addDays(day, granularity === "week" ? 7 : 1)) keys.push(day);
  return keys;
}
export const bucketOf = (day: string, granularity: Granularity): string => (granularity === "week" ? weekStart(day) : day);
