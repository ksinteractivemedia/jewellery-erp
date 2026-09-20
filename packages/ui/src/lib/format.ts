/**
 * Formatting helpers shared by the jewellery-specific display components.
 * Money is handled in whole rupees here for display purposes; persisted values
 * are integer paise (see docs/data-model.md) — callers convert before passing in.
 */

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrFormatterPrecise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatCurrency(amountInRupees: number, opts?: { precise?: boolean }) {
  return (opts?.precise ? inrFormatterPrecise : inrFormatter).format(amountInRupees);
}

export function formatWeight(grams: number, opts?: { unit?: "g" | "ct"; precision?: number }) {
  const precision = opts?.precision ?? 3;
  const unit = opts?.unit ?? "g";
  return `${grams.toFixed(precision)} ${unit}`;
}

export function formatPercentage(value: number, opts?: { precision?: number }) {
  const precision = opts?.precision ?? 2;
  return `${value.toFixed(precision)}%`;
}

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/** "20 Sep 2026". Accepts an ISO string because that is what JSON APIs hand the frontend. */
export function formatDate(value: Date | string) {
  return dateFormat.format(typeof value === "string" ? new Date(value) : value);
}
