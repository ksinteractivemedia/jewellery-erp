"use client";

import * as React from "react";
import type { InventoryListItem } from "@jewellery/types";
import { Button, Combobox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FormField, Input, Textarea } from "@jewellery/ui";
import { inventoryApi } from "../../lib/api/inventory";
import { useInventoryMeta, useInventoryMutation } from "../../lib/api/inventory-queries";
import { LOCATION_TYPE_LABELS } from "../../lib/inventory/format";
import type { OperationSpec } from "../../lib/inventory/operations";

/** One dialog for every custody operation on a selection: transfer, hallmarking/repair/job-work/manufacturing out and back, return inspection. */
export function MoveDialog({ op, items, onClose, onDone }: { op: OperationSpec | null; items: InventoryListItem[]; onClose: () => void; onDone: () => void }) {
  const meta = useInventoryMeta();
  const [destination, setDestination] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [huids, setHuids] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    setDestination("");
    setReason("");
    setHuids({});
    setError(undefined);
  }, [op?.kind]);

  const sources = new Set(items.map((i) => i.location.id));
  const options = (meta.data?.locations ?? [])
    .filter((l) => op?.destinationTypes.includes(l.type) && !(op.kind === "TRANSFER" && sources.has(l.id)))
    .map((l) => ({ value: l.id, label: l.name, description: LOCATION_TYPE_LABELS[l.type] }));

  const run = useInventoryMutation(
    async () => {
      const itemIds = items.map((i) => i.id);
      if (!op) return;
      if (op.kind === "TRANSFER") return inventoryApi.createTransfer({ fromLocationId: items[0]!.location.id, toLocationId: destination, itemIds, notes: reason || undefined });
      if (op.kind === "INSPECT_AVAILABLE" || op.kind === "INSPECT_DAMAGED") return inventoryApi.inspectReturn({ itemIds, outcome: op.kind === "INSPECT_AVAILABLE" ? "AVAILABLE" : "DAMAGED", destinationLocationId: destination, reason: reason || undefined });
      return inventoryApi.move({
        type: op.kind,
        itemIds,
        destinationLocationId: destination,
        reason: reason || undefined,
        ...(op.asksHuid ? { hallmarkResults: items.filter((i) => huids[i.id]?.trim()).map((i) => ({ itemId: i.id, huid: huids[i.id]!.trim().toUpperCase() })) } : {}),
      });
    },
    { success: `${op?.label ?? "Done"} · ${items.length} piece${items.length === 1 ? "" : "s"}`, onSuccess: onDone, onError: (e) => setError(e instanceof Error ? e.message : "Failed") }
  );

  const mixedSources = op?.kind === "TRANSFER" && sources.size > 1;
  const badHuid = op?.asksHuid && Object.values(huids).some((h) => h && !/^[A-Za-z0-9]{6}$/.test(h.trim()));
  const canSubmit = Boolean(op && destination && !mixedSources && !badHuid);

  return (
    <Dialog open={op !== null} onOpenChange={(o) => !o && !run.isPending && onClose()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(undefined);
            run.mutate(undefined);
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{op?.label}</DialogTitle>
            <DialogDescription>
              {items.length} piece{items.length === 1 ? "" : "s"} selected. {op?.help}
            </DialogDescription>
          </DialogHeader>
          {mixedSources && <p role="alert" className="text-body-sm text-danger">These pieces are in different locations. A transfer starts from one location — select pieces from a single location.</p>}
          <FormField label={op?.destinationLabel ?? "Destination"} htmlFor="move-destination" required hint={options.length === 0 ? "No matching location is set up yet." : undefined}>
            <Combobox aria-label={op?.destinationLabel ?? "Destination"} placeholder="Choose a location" searchPlaceholder="Search locations…" options={options} value={destination} onValueChange={setDestination} />
          </FormField>
          {op?.asksHuid && (
            <FormField label="HUID per piece" hint="Six letters/digits from the hallmark. Leave blank for a piece that came back without one.">
              <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate font-mono text-body-sm">{i.itemCode}</span>
                    <Input aria-label={`HUID for ${i.itemCode}`} value={huids[i.id] ?? ""} maxLength={6} className="font-mono uppercase" onChange={(e) => setHuids({ ...huids, [i.id]: e.target.value })} invalid={Boolean(huids[i.id]) && !/^[A-Za-z0-9]{6}$/.test(huids[i.id]!.trim())} />
                  </li>
                ))}
              </ul>
            </FormField>
          )}
          <FormField label="Note" htmlFor="move-reason">
            <Textarea id="move-reason" rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </FormField>
          {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={run.isPending}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit} loading={run.isPending}>{op?.label}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
