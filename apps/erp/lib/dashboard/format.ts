/** Small display helpers for the dashboard. Pure, so they are tested; none of them computes a business figure. */

export interface Change {
  direction: "up" | "down" | "flat";
  /** "12.4%", "new", "no change". */
  label: string;
}

/** How a figure moved against the equally long period before it. `null` when there is nothing to compare against. */
export function changeVs(value: number, previous: number | null): Change | null {
  if (previous === null) return null;
  if (previous === 0) return value === 0 ? { direction: "flat", label: "no change" } : { direction: "up", label: "new" };
  const pct = ((value - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) return { direction: "flat", label: "no change" };
  return { direction: pct > 0 ? "up" : "down", label: `${Math.abs(pct).toFixed(1)}%` };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. `nowMs` is a parameter so this is testable. */
export function timeAgo(iso: string, nowMs: number): string {
  const diff = nowMs - Date.parse(iso);
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  if (diff < 7 * DAY) { const d = Math.floor(diff / DAY); return `${d} ${d === 1 ? "day" : "days"} ago`; }
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(iso));
}

export const daysLabel = (days: number) => (days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
