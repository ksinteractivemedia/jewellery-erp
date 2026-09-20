"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createInventoryItemSchema } from "@jewellery/validation";
import { Alert, Button, Card, CardContent, Combobox, FormField, FormSection, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, WeightInput, formatWeight } from "@jewellery/ui";
import { catalogApi } from "../../lib/api/catalog";
import { inventoryApi } from "../../lib/api/inventory";
import { useInventoryMeta, useInventoryMutation } from "../../lib/api/inventory-queries";
import { useQuery } from "@tanstack/react-query";
import { STOCK_LOCATION_TYPES } from "../../lib/inventory/format";

const KINDS = [
  { value: "FINISHED_JEWELLERY", label: "Finished jewellery", batch: false },
  { value: "SEMI_FINISHED", label: "Semi-finished piece", batch: false },
  { value: "RAW_MATERIAL", label: "Raw material (batch)", batch: true },
  { value: "LOOSE_STONE", label: "Loose stone (batch)", batch: true },
];

/** Receives one physical piece (or batch) into stock. The server derives net and fine weight and writes ledger entry #1 in the same transaction. */
export function ReceiveItemForm() {
  const router = useRouter();
  const meta = useInventoryMeta();
  const products = useQuery({ queryKey: ["catalog", "products", "picker"], queryFn: () => catalogApi.listProducts({ pageSize: 100, sort: "name", order: "asc" } as never), staleTime: 60_000 });

  const [productId, setProductId] = React.useState("");
  const [variantId, setVariantId] = React.useState("");
  const [kind, setKind] = React.useState("FINISHED_JEWELLERY");
  const [metalId, setMetalId] = React.useState("");
  const [purity, setPurity] = React.useState("");
  const [gross, setGross] = React.useState<number>();
  const [stone, setStone] = React.useState<number>();
  const [quantity, setQuantity] = React.useState("1");
  const [cost, setCost] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [huid, setHuid] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [note, setNote] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string>();

  const product = useQuery({ queryKey: ["catalog", "product", productId], queryFn: () => catalogApi.getProduct(productId), enabled: Boolean(productId) });
  // Choosing a product pre-fills its metal and purity — a convenience the person can override.
  React.useEffect(() => {
    if (product.data) { setMetalId(product.data.metalId); setPurity(product.data.purity ?? ""); setVariantId(""); }
  }, [product.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const batch = KINDS.find((k) => k.value === kind)?.batch ?? false;
  const metals = meta.data?.metals ?? [];
  const purities = metals.find((m) => m.id === metalId)?.purities ?? [];
  const stockLocations = (meta.data?.locations ?? []).filter((l) => STOCK_LOCATION_TYPES.includes(l.type));
  // A purity only makes sense for its metal: clear it when the metal changes to one that doesn't offer it.
  // (An effect, not a change-handler, so pre-filling metal and purity together from a product can't clear itself.)
  React.useEffect(() => {
    if (purity && meta.data && !purities.includes(purity)) setPurity("");
  }, [metalId, purity, purities.join(","), meta.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const net = gross !== undefined ? Math.max(0, Math.round((gross - (stone ?? 0)) * 1000) / 1000) : undefined;

  const receive = useInventoryMutation((body: Record<string, unknown>) => inventoryApi.receive(body), {
    success: (item) => `Received ${item.itemCode}`,
    onSuccess: (item) => router.push(`/inventory/stock/${item.id}`),
    onError: (e) => setServerError(e instanceof Error ? e.message : "Failed"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const paise = cost.trim() === "" ? undefined : Math.round(Number(cost) * 100);
    const body: Record<string, unknown> = {
      type: kind, serialization: batch ? "BATCH" : "UNIT", metalId, purity, locationId,
      grossWeight: gross, stoneWeight: stone ?? 0, cost: paise, quantity: batch ? Number(quantity) : 1,
      ...(productId ? { productId } : {}), ...(variantId ? { variantId } : {}),
      ...(huid.trim() ? { huid: huid.trim() } : {}), ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
      ...(note.trim() ? { reason: note.trim() } : {}),
    };
    const parsed = createInventoryItemSchema.safeParse(body);
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setErrors({});
    setServerError(undefined);
    receive.mutate(body);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          <FormSection title="What is it?" description="Link it to a catalogue product if it is a design you sell. Its item code is generated for you.">
            <FormField label="Product" htmlFor="rc-product" hint="Optional — raw material has none.">
              <Combobox aria-label="Product" placeholder="No product" searchPlaceholder="Search products…" options={[{ value: "", label: "No product" }, ...(products.data?.items ?? []).map((p) => ({ value: p.id, label: p.name, description: p.sku }))]} value={productId} onValueChange={setProductId} />
            </FormField>
            <FormField label="Variant" htmlFor="rc-variant" hint={product.data && product.data.variants.length === 0 ? "This product has no variants." : undefined}>
              <Combobox aria-label="Variant" placeholder={productId ? "No variant" : "Choose a product first"} disabled={!product.data || product.data.variants.length === 0} options={[{ value: "", label: "No variant" }, ...(product.data?.variants ?? []).map((v) => ({ value: v.id, label: v.sku }))]} value={variantId} onValueChange={setVariantId} />
            </FormField>
            <FormField label="Kind" htmlFor="rc-kind">
              <Select value={kind} onValueChange={setKind}><SelectTrigger id="rc-kind" aria-label="Kind"><SelectValue /></SelectTrigger><SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent></Select>
            </FormField>
            {batch && <FormField label="Quantity" htmlFor="rc-qty" error={errors.quantity}><Input id="rc-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} /></FormField>}
          </FormSection>

          <FormSection title="Metal & weights" description="Net and fine weight are calculated from these — they aren't typed in.">
            <FormField label="Metal" htmlFor="rc-metal" required error={errors.metalId}>
              <Select value={metalId} onValueChange={setMetalId}><SelectTrigger id="rc-metal" aria-label="Metal" invalid={!!errors.metalId}><SelectValue placeholder="Choose a metal" /></SelectTrigger><SelectContent>{metals.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select>
            </FormField>
            <FormField label="Purity" htmlFor="rc-purity" required error={errors.purity}>
              {/* Combobox, not Select: Radix Select clears its value when the value and its options arrive in the same render (pre-fill from a product). */}
              <Combobox aria-label="Purity" placeholder={metalId ? "Choose a purity" : "Choose a metal first"} disabled={!metalId} options={purities.map((p) => ({ value: p, label: p }))} value={purity} onValueChange={setPurity} />
            </FormField>
            <FormField label="Gross weight" htmlFor="rc-gross" required error={errors.grossWeight} hint="Up to 3 decimals, in grams.">
              <WeightInput id="rc-gross" value={gross} onValueChange={setGross} invalid={!!errors.grossWeight} />
            </FormField>
            <FormField label="Stone weight" htmlFor="rc-stone" error={errors.stoneWeight}>
              <WeightInput id="rc-stone" value={stone} onValueChange={setStone} invalid={!!errors.stoneWeight} />
            </FormField>
            {net !== undefined && <p className="text-body-sm text-muted sm:col-span-2" data-testid="net-preview">Net metal weight: <span className="tabular font-medium text-foreground">{formatWeight(net)}</span></p>}
          </FormSection>

          <FormSection title="Where & what it cost">
            <FormField label="Received into" htmlFor="rc-location" required error={errors.locationId}>
              <Combobox aria-label="Location" placeholder="Choose a location" searchPlaceholder="Search locations…" options={stockLocations.map((l) => ({ value: l.id, label: l.name }))} value={locationId} onValueChange={setLocationId} />
            </FormField>
            <FormField label="Cost (₹)" htmlFor="rc-cost" required error={errors.cost} hint="Total book cost of this piece or batch.">
              <Input id="rc-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))} invalid={!!errors.cost} className="text-right tabular" />
            </FormField>
          </FormSection>

          <FormSection title="Identifiers" description="Optional now — a HUID or barcode can be added later.">
            <FormField label="HUID" htmlFor="rc-huid" error={errors.huid} hint="Six letters/digits. Marks the piece hallmarked.">
              <Input id="rc-huid" value={huid} maxLength={6} onChange={(e) => setHuid(e.target.value)} invalid={!!errors.huid} className="font-mono uppercase" />
            </FormField>
            <FormField label="Barcode" htmlFor="rc-barcode" error={errors.barcode}><Input id="rc-barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} invalid={!!errors.barcode} className="font-mono" /></FormField>
            <FormField label="Note" htmlFor="rc-note" className="sm:col-span-2"><Textarea id="rc-note" rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></FormField>
          </FormSection>
          {serverError && <Alert variant="danger" title="Couldn't receive this stock">{serverError}</Alert>}
        </CardContent>
      </Card>
      <div className="sticky bottom-0 z-30 -mx-4 -mb-4 flex justify-end gap-2 border-t border-border bg-surface-elevated px-4 py-3 md:-mx-6 md:-mb-6 md:px-6">
        <Button asChild variant="secondary"><Link href="/inventory/stock">Cancel</Link></Button>
        <Button type="submit" loading={receive.isPending}>Receive into stock</Button>
      </div>
    </form>
  );
}
