/**
 * Scan-code architecture (no hardware code here). Anything that produces text — a USB/Bluetooth
 * scanner acting as a keyboard, a phone camera, a typed code — feeds the same parser, and the
 * server resolves the result to an item. Labels carry the item code, so a piece can be
 * identified from its label alone.
 *
 * QR payload:  JERP:ITEM:<itemCode>   e.g. JERP:ITEM:JE-000123
 *   uppercase + digits + `-` `:` only, so it encodes in a QR's compact alphanumeric mode.
 * 1-D barcode: the bare item code or the item's `barcode` field (Code 128 handles both).
 * HUID:        the six-character mark, scannable from the hallmark's own DataMatrix/QR text.
 */
export const SCAN_QR_PREFIX = "JERP:ITEM:";
export const MAX_SCAN_LENGTH = 128;

export type ScanLookup = "ITEM_CODE" | "BARCODE" | "HUID" | "SERIAL_NUMBER";

export interface ParsedScan {
  raw: string;
  /** The value to look up. */
  value: string;
  format: "QR_URI" | "PLAIN";
  /** Fields to try, in order. A QR URI names its field; plain text could be any. */
  lookups: ScanLookup[];
}

/** Scanners append CR/LF/Tab and some prefix a symbology id; strip control characters and whitespace. */
export function normalizeScan(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

export function parseScanCode(raw: string): ParsedScan | null {
  const value = normalizeScan(raw);
  if (!value || value.length > MAX_SCAN_LENGTH) return null;

  if (value.toUpperCase().startsWith(SCAN_QR_PREFIX)) {
    const code = value.slice(SCAN_QR_PREFIX.length).trim().toUpperCase();
    return /^[A-Z0-9._\-/]{1,40}$/.test(code) ? { raw, value: code, format: "QR_URI", lookups: ["ITEM_CODE"] } : null;
  }
  if (!/^[A-Za-z0-9._\-/]+$/.test(value)) return null;

  const lookups: ScanLookup[] = ["ITEM_CODE", "BARCODE", "SERIAL_NUMBER"];
  if (/^[A-Za-z0-9]{6}$/.test(value)) lookups.push("HUID");
  return { raw, value, format: "PLAIN", lookups };
}

/** The text to encode in a label's QR for an item. */
export const itemQrPayload = (itemCode: string) => `${SCAN_QR_PREFIX}${itemCode.toUpperCase()}`;
