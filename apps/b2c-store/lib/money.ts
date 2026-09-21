const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrPrecise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Integer paise → "₹1,23,456". Whole rupees for headline prices; `precise` for line items where the paisa is part of the sum. */
export const formatMoney = (paise: number, opts: { precise?: boolean } = {}) => (opts.precise ? inrPrecise : inr).format(paise / 100);
export const formatGrams = (g: number) => `${g.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} g`;

// Fixed to the business timezone so the server and the browser print the same thing (no hydration mismatch, and a price time means one thing).
const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
export const formatDate = (iso: string) => day.format(new Date(iso));
export const formatTime = (iso: string) => time.format(new Date(iso));

/** Whole rupees typed into a price filter → paise; blank or malformed → undefined. */
export function rupeesToPaise(text: string | undefined): number | undefined {
  const t = (text ?? "").replace(/[,\s₹]/g, "");
  return /^\d{1,9}$/.test(t) ? Number(t) * 100 : undefined;
}
