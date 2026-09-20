"use client";

import * as React from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FormField, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@jewellery/ui";
import { zId } from "@jewellery/validation";
import { inventoryApi } from "../../lib/api/inventory";
import { useInventoryMutation } from "../../lib/api/inventory-queries";
import { newHoldReference } from "../../lib/inventory/format";

const HOLDS = [
  { value: "30", label: "30 minutes" },
  { value: "120", label: "2 hours" },
  { value: "1440", label: "1 day" },
  { value: "open", label: "Until released" },
];

/** Holds pieces for an order (or, with no order yet, a counter hold). A held piece can't be sold to anyone else until it is released, sold on that order, or expires. */
export function ReserveDialog({ itemIds, open, onClose, onDone }: { itemIds: string[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const [order, setOrder] = React.useState("");
  const [hold, setHold] = React.useState("120");
  const [error, setError] = React.useState<string>();
  React.useEffect(() => {
    if (open) {
      setOrder("");
      setHold("120");
      setError(undefined);
    }
  }, [open]);

  const reserve = useInventoryMutation(
    () =>
      inventoryApi.reserve({
        itemIds,
        referenceType: order.trim() ? "ORDER" : "MANUAL",
        referenceId: order.trim() || newHoldReference(),
        expiresInMinutes: hold === "open" ? undefined : Number(hold),
      }),
    { success: `Reserved ${itemIds.length} piece${itemIds.length === 1 ? "" : "s"}`, onSuccess: onDone, onError: (e) => setError(e instanceof Error ? e.message : "Failed") }
  );

  const orderInvalid = order.trim() !== "" && !zId.safeParse(order.trim()).success;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !reserve.isPending && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); setError(undefined); reserve.mutate(undefined); }} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Reserve {itemIds.length} piece{itemIds.length === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>They are held off the shelf for this order and can&apos;t be sold to anyone else.</DialogDescription>
          </DialogHeader>
          <FormField label="Order ID" htmlFor="reserve-order" error={orderInvalid ? "An order ID is 24 letters/digits" : undefined} hint="Leave blank for a counter hold (a customer deciding in the shop).">
            <Input id="reserve-order" value={order} onChange={(e) => setOrder(e.target.value)} invalid={orderInvalid} className="font-mono" autoComplete="off" />
          </FormField>
          <FormField label="Hold for" htmlFor="reserve-hold">
            <Select value={hold} onValueChange={setHold}>
              <SelectTrigger id="reserve-hold" aria-label="Hold for"><SelectValue /></SelectTrigger>
              <SelectContent>{HOLDS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={reserve.isPending}>Cancel</Button>
            <Button type="submit" disabled={orderInvalid} loading={reserve.isPending}>Reserve</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
