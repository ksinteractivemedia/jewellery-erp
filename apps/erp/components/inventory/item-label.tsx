"use client";

import * as React from "react";
import { Copy } from "lucide-react";
import { toast } from "@jewellery/ui";
import { itemQrPayload } from "@jewellery/validation";
import { Button, formatWeight } from "@jewellery/ui";

/**
 * The scannable label for a piece: a QR carrying `JERP:ITEM:<code>` (see packages/validation/src/inventory-scan.ts).
 * Scanning it anywhere in the ERP resolves straight back to this piece. Printing/label-printer output is a later step.
 */
export function ItemLabel({ itemCode, purity, netWeight, huid }: { itemCode: string; purity: string; netWeight: number; huid?: string }) {
  const payload = itemQrPayload(itemCode);
  const [src, setSrc] = React.useState<string>();
  React.useEffect(() => {
    let live = true;
    void import("qrcode").then((QR) => QR.toDataURL(payload, { margin: 1, width: 160, errorCorrectionLevel: "M" })).then((url) => live && setSrc(url));
    return () => { live = false; };
  }, [payload]);

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-[112px] w-[112px] shrink-0 items-center justify-center rounded-md border border-border bg-white p-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={`QR code for ${itemCode}`} className="h-full w-full" /> : <span className="text-caption text-muted">…</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-body font-medium">{itemCode}</span>
        <span className="text-body-sm text-muted">{purity} · {formatWeight(netWeight)} net{huid ? ` · ${huid}` : ""}</span>
        <code className="truncate text-caption text-muted" title="What the QR code contains">{payload}</code>
        <Button size="sm" variant="secondary" className="w-fit" onClick={() => void navigator.clipboard?.writeText(payload).then(() => toast({ title: "Label text copied", variant: "success" }))}>
          <Copy className="h-3.5 w-3.5" /> Copy label text
        </Button>
      </div>
    </div>
  );
}
