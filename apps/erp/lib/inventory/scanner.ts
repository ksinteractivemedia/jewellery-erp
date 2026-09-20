"use client";

import * as React from "react";

/**
 * Scanner architecture. Anything that can produce a code implements `ScanSource`; the app subscribes
 * to all registered sources and every scan goes down the same path (`parseScanCode` → `GET
 * /api/inventory/scan` → open the item). Today there is one source, the keyboard wedge — which is how
 * USB and Bluetooth-HID barcode scanners present themselves (they "type" the code and press Enter), so
 * they work with no device code at all. A phone-camera source (BarcodeDetector / ZXing) or a native
 * bridge would be another `ScanSource` added to `SCAN_SOURCES`; nothing else changes. No hardware
 * integration exists here or is needed yet.
 */
export interface ScanSource {
  readonly id: string;
  /** Starts listening; returns the function that stops. */
  start(onScan: (code: string) => void): () => void;
}

/**
 * Detects scanner input by its speed: a scanner delivers a whole code in a few milliseconds, then Enter,
 * where a person types with 100+ ms between keys. Keystrokes into a text field are left alone (a field
 * marked `data-scan-target` still receives the scan itself, via its own Enter handling).
 */
export function keyboardWedgeSource(opts: { maxGapMs?: number; minLength?: number } = {}): ScanSource {
  const maxGap = opts.maxGapMs ?? 40;
  const minLength = opts.minLength ?? 4;
  return {
    id: "keyboard-wedge",
    start(onScan) {
      let buffer = "";
      let last = 0;
      const handler = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest("input, textarea, select, [contenteditable='true']") || e.ctrlKey || e.metaKey || e.altKey) return;
        const now = performance.now();
        if (now - last > maxGap) buffer = "";
        last = now;
        if (e.key === "Enter") {
          if (buffer.length >= minLength) {
            e.preventDefault();
            onScan(buffer);
          }
          buffer = "";
        } else if (e.key.length === 1) {
          buffer += e.key;
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    },
  };
}

export const SCAN_SOURCES: ScanSource[] = [keyboardWedgeSource()];

/** Subscribes the calling screen to every scan source while `enabled`. `onScan` may change freely between renders. */
export function useScanner(onScan: (code: string) => void, enabled = true) {
  const ref = React.useRef(onScan);
  ref.current = onScan;
  React.useEffect(() => {
    if (!enabled) return;
    const stops = SCAN_SOURCES.map((s) => s.start((code) => ref.current(code)));
    return () => stops.forEach((stop) => stop());
  }, [enabled]);
}
