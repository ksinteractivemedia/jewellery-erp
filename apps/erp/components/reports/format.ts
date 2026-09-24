import type { ReportColumnFormat } from "@jewellery/types";
import { formatCurrency, formatDate, formatNumber, formatPercentage, formatWeight } from "@jewellery/ui";

/** Every report column/summary figure carries its own format — the browser only renders what the API already computed, never re-derives it. Money travels the wire in paise, like everywhere else in the app. */
export function formatReportValue(value: unknown, format?: ReportColumnFormat): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (format) {
    case "money":
      return formatCurrency(Number(value) / 100, { precise: true });
    case "weight":
      return formatWeight(Number(value));
    case "percent":
      return formatPercentage(Number(value));
    case "number":
      return formatNumber(Number(value));
    case "date":
      return /^\d{4}-\d{2}$/.test(String(value)) ? String(value) : formatDate(String(value));
    default:
      return String(value);
  }
}
