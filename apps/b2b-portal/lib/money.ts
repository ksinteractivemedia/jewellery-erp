const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 });
const day = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const dayTime = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Paise → ₹ with paise (wholesale amounts are read to the paisa). */
export const money = (paise: number) => inr.format(paise / 100);
/** Paise → whole ₹, for headline figures. */
export const money0 = (paise: number) => inr0.format(paise / 100);
export const moneyCompact = (paise: number) => `₹${compact.format(paise / 100)}`;
/** A business day (YYYY-MM-DD, IST) or an ISO instant, as "21 Sep 2026". */
export const date = (v: string) => day.format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00+05:30` : v));
export const dateTime = (iso: string) => dayTime.format(new Date(iso));
export const grams = (g?: number) => (g === undefined ? "—" : `${g.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} g`);
/** Rupees the user typed ("1,50,000.50") → integer paise, or undefined if it isn't a clean amount. */
export function rupeesToPaise(text: string): number | undefined {
  const t = text.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  return Math.round(Number(t) * 100);
}
export const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
