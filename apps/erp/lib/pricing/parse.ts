/**
 * Turning what a person typed into numbers. This is input PARSING, not pricing: it never computes a
 * price, and the API re-validates everything it receives (business-rules.md §8.1).
 */

// Commas are accepted only as real thousands grouping — 6,500 or Indian 12,34,567. Anything else ("1,5", typed as a
// decimal comma) is left as-is so it is refused: silently reading "1,5" as 15 would turn a 1.5% tax into 15%.
const GROUPED = /^\d{1,3}(?:,\d{3})+(?:\.\d*)?$|^\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d*)?$/;
const clean = (text: string) => {
  const t = text.replace(/[\s₹]/g, "");
  return t.includes(",") && GROUPED.test(t) ? t.replace(/,/g, "") : t;
};

/** "1,250.5" → 1250.5. Blank, malformed, or more than `places` decimals → undefined. */
export function parseNumber(text: string, places: number): number | undefined {
  const t = clean(text);
  if (!t || t === ".") return undefined;
  if (!new RegExp(`^\\d*\\.?\\d{0,${places}}$`).test(t)) return undefined;
  return Number(t);
}

/** "6,500.50" → 650050 paise, read from the digits so 0.1 + 0.2 style float error can never creep in. */
export function rupeesToPaise(text: string): number | undefined {
  const match = /^(\d*)(?:\.(\d{1,2}))?$/.exec(clean(text));
  if (!match || (!match[1] && !match[2])) return undefined;
  const paise = Number(match[1] || 0) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : undefined;
}
