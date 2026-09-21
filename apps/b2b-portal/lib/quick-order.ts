import type { B2BResolvedLine } from "@jewellery/types";

export interface Row { key: string; sku: string; quantity: string }
let n = 0;
export const newRow = (sku = "", quantity = ""): Row => ({ key: `r${++n}`, sku, quantity });

/** Rows the server should be asked about: a SKU and a positive whole quantity. Half-filled rows are left alone. */
export function readyRows(rows: Row[]): { sku: string; quantity: number }[] {
  return rows.flatMap((r) => {
    const sku = r.sku.trim();
    const q = Number(r.quantity);
    return sku && Number.isInteger(q) && q > 0 ? [{ sku, quantity: q }] : [];
  });
}

/**
 * Pasted text → rows. One per line: "SKU, quantity", "SKU<tab>quantity" or "SKU quantity"; a bare SKU means 1 piece. This is the
 * same shape a CSV/Excel import will produce later — that import is deliberately not built until this works.
 */
export function parsePaste(text: string): { rows: Row[]; ignored: string[] } {
  const rows: Row[] = [];
  const ignored: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || /^(sku|item|code)\b.*\b(qty|quantity)\b/i.test(t)) continue;
    const m = /^([A-Za-z0-9][A-Za-z0-9._\-/]*)(?:\s*[,;\t ]\s*(\d+))?$/.exec(t);
    if (!m) ignored.push(t);
    else rows.push(newRow(m[1]!.toUpperCase(), m[2] ?? "1"));
  }
  return { rows, ignored };
}

/** Rows with the same SKU count once — the server merges them too, but the screen shows what will be ordered. */
export function mergeRows(rows: { sku: string; quantity: number }[]) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.sku.toUpperCase(), (m.get(r.sku.toUpperCase()) ?? 0) + r.quantity);
  return [...m].map(([sku, quantity]) => ({ sku, quantity }));
}

export const blocking = (l: B2BResolvedLine) => l.problems.some((p) => p.blocking);
