import { MAX_DASHBOARD_RANGE_DAYS, zDay } from "@jewellery/validation";

/**
 * Date-range presets for the dashboard. "Today" is the server's business day (`meta.today`), never the browser's
 * clock, so a laptop in another timezone still asks for the same day the API means. Days are plain
 * YYYY-MM-DD strings and all arithmetic is in UTC — a calendar day has no timezone.
 */
export const RANGE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "mtd", label: "This month" },
  { id: "custom", label: "Custom" },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]["id"];
export const DEFAULT_PRESET: RangePreset = "30d";
export const isPreset = (value: unknown): value is RangePreset => RANGE_PRESETS.some((p) => p.id === value);

const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);
export const addDays = (day: string, n: number) => new Date(ms(day) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((ms(to) - ms(from)) / 86_400_000);

export interface ResolvedDashboardRange {
  /** What is actually applied — a custom range that doesn't hold up falls back to the default, and says so here. */
  preset: RangePreset;
  from: string;
  to: string;
  days: number;
}

/** Whether a from/to pair is a real range the API will accept: both real days, in order, no more than a year. */
export function isValidCustomRange(from: string | undefined, to: string | undefined): boolean {
  return Boolean(from && to && zDay.safeParse(from).success && zDay.safeParse(to).success && from <= to && daysBetween(from, to) < MAX_DASHBOARD_RANGE_DAYS);
}

export function resolveDashboardRange(preset: RangePreset, today: string, custom: { from?: string; to?: string } = {}): ResolvedDashboardRange {
  const make = (p: RangePreset, from: string, to: string): ResolvedDashboardRange => ({ preset: p, from, to, days: daysBetween(from, to) + 1 });
  switch (preset) {
    case "today": return make("today", today, today);
    case "7d": return make("7d", addDays(today, -6), today);
    case "mtd": return make("mtd", `${today.slice(0, 8)}01`, today);
    case "custom": {
      const { from, to } = custom;
      if (isValidCustomRange(from, to)) return make("custom", from!, to!);
      return make("30d", addDays(today, -29), today);
    }
    default: return make("30d", addDays(today, -29), today);
  }
}

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const dayYearFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const utc = (day: string) => new Date(ms(day));

/** "20 Sep 2026" or "14 – 20 Sep 2026" or "28 Aug – 20 Sep 2026". */
export function formatRange(from: string, to: string): string {
  if (from === to) return dayYearFormat.format(utc(to));
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${sameYear ? dayFormat.format(utc(from)) : dayYearFormat.format(utc(from))} – ${dayYearFormat.format(utc(to))}`;
}
export const formatDay = (day: string) => dayFormat.format(utc(day));
export const formatDayLong = (day: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(utc(day));
