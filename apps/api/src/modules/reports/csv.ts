import type { ReportResult } from "@jewellery/types";

const escapeCell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** A report result as a CSV file — the export path, so a browser never has to hold and render a huge row set to get the data out. */
export function reportToCsv(result: ReportResult): string {
  const header = result.columns.map((c) => escapeCell(c.label)).join(",");
  const lines = result.rows.map((row) => result.columns.map((c) => escapeCell((row as Record<string, unknown>)[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}
