"use client";

import * as React from "react";
import type { InventoryItemDetail } from "@jewellery/types";
import { updateInventoryItemDetailsSchema } from "@jewellery/validation";
import { Alert, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FormField, Input } from "@jewellery/ui";
import { inventoryApi } from "../../lib/api/inventory";
import { useInventoryMutation } from "../../lib/api/inventory-queries";

/** Barcode, serial number and HUID. A HUID is the piece's legal identity: set once, never changed. */
export function IdentifiersDialog({ item, open, onClose }: { item: InventoryItemDetail; open: boolean; onClose: () => void }) {
  const [barcode, setBarcode] = React.useState("");
  const [serial, setSerial] = React.useState("");
  const [huid, setHuid] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string>();
  React.useEffect(() => {
    if (open) { setBarcode(item.barcode ?? ""); setSerial(item.serialNumber ?? ""); setHuid(item.huid ?? ""); setErrors({}); setServerError(undefined); }
  }, [open, item]);

  const save = useInventoryMutation(
    (body: Record<string, string>) => inventoryApi.updateIdentifiers(item.id, body),
    { success: "Identifiers saved", onSuccess: onClose, onError: (e) => setServerError(e instanceof Error ? e.message : "Failed") }
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, string> = {};
    if (barcode.trim() && barcode.trim() !== item.barcode) body.barcode = barcode.trim();
    if (serial.trim() && serial.trim() !== item.serialNumber) body.serialNumber = serial.trim();
    if (!item.huid && huid.trim()) body.huid = huid.trim();
    const parsed = updateInventoryItemDetailsSchema.safeParse(body);
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    if (!Object.keys(body).length) return onClose();
    setErrors({});
    save.mutate(body);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader><DialogTitle>Identifiers · {item.itemCode}</DialogTitle><DialogDescription>These don&apos;t change stock, so they don&apos;t create a ledger entry — but they are audited.</DialogDescription></DialogHeader>
          <FormField label="HUID" htmlFor="id-huid" error={errors.huid} hint={item.huid ? "A HUID can't be changed once recorded." : "Six letters/digits. Recording one marks the piece hallmarked."}>
            <Input id="id-huid" value={huid} maxLength={6} disabled={Boolean(item.huid)} onChange={(e) => setHuid(e.target.value)} invalid={!!errors.huid} className="font-mono uppercase" />
          </FormField>
          <FormField label="Barcode" htmlFor="id-barcode" error={errors.barcode}><Input id="id-barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} invalid={!!errors.barcode} className="font-mono" /></FormField>
          <FormField label="Serial number" htmlFor="id-serial" error={errors.serialNumber}><Input id="id-serial" value={serial} onChange={(e) => setSerial(e.target.value)} invalid={!!errors.serialNumber} className="font-mono" /></FormField>
          {serverError && <Alert variant="danger">{serverError}</Alert>}
          <DialogFooter><Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button type="submit" loading={save.isPending}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
