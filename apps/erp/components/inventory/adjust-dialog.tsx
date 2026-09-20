"use client";

import * as React from "react";
import type { InventoryItem, InventoryStatus } from "@jewellery/types";
import { requestAdjustmentSchema, type RequestAdjustmentInput } from "@jewellery/validation";
import { Alert, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FormField, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, WeightInput } from "@jewellery/ui";
import { inventoryApi } from "../../lib/api/inventory";
import { useInventoryMutation } from "../../lib/api/inventory-queries";

const STATUSES: InventoryStatus[] = ["AVAILABLE", "RESERVED", "SOLD", "RETURNED", "DAMAGED", "UNDER_REPAIR", "IN_MANUFACTURING", "WITH_JOB_WORKER", "IN_TRANSIT", "HALLMARKING", "SCRAP", "MELTING"];
const KEEP = "__keep__";
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

type Target = Pick<InventoryItem, "id" | "itemCode" | "serialization" | "status" | "grossWeight" | "stoneWeight" | "quantity">;

/** Asks for a correction. Nothing changes until someone else with approval authority accepts it. */
export function AdjustDialog({ item, open, onClose }: { item: Target | null; open: boolean; onClose: () => void }) {
  const [status, setStatus] = React.useState(KEEP);
  const [gross, setGross] = React.useState<number>();
  const [stone, setStone] = React.useState<number>();
  const [qty, setQty] = React.useState<string>("");
  const [weight, setWeight] = React.useState<string>("");
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string>();
  const unit = item?.serialization === "UNIT";

  React.useEffect(() => {
    if (open) {
      setStatus(KEEP); setGross(undefined); setStone(undefined); setQty(""); setWeight(""); setReason(""); setErrors({}); setServerError(undefined);
    }
  }, [open, item?.id]);

  const request = useInventoryMutation((input: RequestAdjustmentInput) => inventoryApi.requestAdjustment(input), {
    success: "Adjustment requested — awaiting approval",
    onSuccess: onClose,
    onError: (e) => setServerError(e instanceof Error ? e.message : "Failed"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    const input: RequestAdjustmentInput = {
      itemId: item.id,
      reason,
      ...(status !== KEEP ? { toStatus: status as InventoryStatus } : {}),
      ...(unit && gross !== undefined ? { grossWeight: gross } : {}),
      ...(unit && stone !== undefined ? { stoneWeight: stone } : {}),
      ...(!unit && qty.trim() ? { quantityDelta: Number(qty) } : {}),
      ...(!unit && weight.trim() ? { weightDelta: Number(weight) } : {}),
    };
    const parsed = requestAdjustmentSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setServerError(undefined);
    request.mutate(input);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !request.isPending && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Request adjustment · {item?.itemCode}</DialogTitle>
            <DialogDescription>Corrections aren&apos;t applied directly. A different person with approval authority reviews the request, and only then is it written to the ledger.</DialogDescription>
          </DialogHeader>
          <FormField label="Change status to" htmlFor="adj-status" error={errors.toStatus} hint={`Currently ${item ? label(item.status) : ""}. Only legal changes are accepted.`}>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="adj-status" aria-label="Change status to"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Keep current status</SelectItem>
                {STATUSES.filter((s) => s !== item?.status).map((s) => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          {unit ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Re-weighed gross" htmlFor="adj-gross" error={errors.grossWeight} hint={`Now ${item?.grossWeight} g`}><WeightInput id="adj-gross" value={gross} onValueChange={setGross} /></FormField>
              <FormField label="Re-weighed stone" htmlFor="adj-stone" error={errors.stoneWeight} hint={`Now ${item?.stoneWeight} g`}><WeightInput id="adj-stone" value={stone} onValueChange={setStone} /></FormField>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Quantity change" htmlFor="adj-qty" error={errors.quantityDelta} hint={`On hand ${item?.quantity}. Use a minus for a loss.`}>
                <input id="adj-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d-]/g, ""))} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-right tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </FormField>
              <FormField label="Weight change (g)" htmlFor="adj-weight" error={errors.weightDelta}>
                <input id="adj-weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.-]/g, ""))} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-right tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </FormField>
            </div>
          )}
          <FormField label="Reason" htmlFor="adj-reason" required error={errors.reason}>
            <Textarea id="adj-reason" rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} invalid={!!errors.reason} />
          </FormField>
          {serverError && <Alert variant="danger">{serverError}</Alert>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={request.isPending}>Cancel</Button>
            <Button type="submit" loading={request.isPending}>Request adjustment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
