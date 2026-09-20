"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ProductVariant } from "@jewellery/types";
import { createVariantBodySchema, type CreateVariantBodyInput } from "@jewellery/validation";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FormField, Input, Switch, WeightInput } from "@jewellery/ui";
import { catalogApi } from "../../lib/api/catalog";
import { useCatalogMutation } from "../../lib/api/queries";

interface Row {
  name: string;
  value: string;
}

/** Add or edit one variant (ring size, bangle size…). Variants belong to a product and inherit its imagery and metal. */
export function VariantDialog({ productId, variant, open, onOpenChange }: { productId: string; variant?: ProductVariant; open: boolean; onOpenChange: (open: boolean) => void }) {
  const editing = variant !== undefined;
  const [sku, setSku] = React.useState("");
  const [rows, setRows] = React.useState<Row[]>([{ name: "size", value: "" }]);
  const [gross, setGross] = React.useState<number>();
  const [net, setNet] = React.useState<number>();
  const [isActive, setIsActive] = React.useState(true);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setSku(variant?.sku ?? "");
    const attrs = Object.entries(variant?.attributes ?? {}).map(([name, value]) => ({ name, value }));
    setRows(attrs.length ? attrs : [{ name: "size", value: "" }]);
    setGross(variant?.defaultGrossWeight);
    setNet(variant?.defaultNetWeight);
    setIsActive(variant?.isActive ?? true);
    setErrors({});
  }, [open, variant]);

  const save = useCatalogMutation(
    (body: CreateVariantBodyInput) => (variant ? catalogApi.updateVariant(productId, variant.id, { attributes: body.attributes, defaultGrossWeight: body.defaultGrossWeight, defaultNetWeight: body.defaultNetWeight, isActive: body.isActive }) : catalogApi.createVariant(productId, body)),
    {
      success: editing ? "Variant saved" : "Variant added",
      onSuccess: () => onOpenChange(false),
      onError: (e) => e instanceof Error && setErrors({ sku: e.message }),
    }
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const attributes = Object.fromEntries(rows.filter((r) => r.name.trim() && r.value.trim()).map((r) => [r.name.trim().toLowerCase(), r.value.trim()]));
    const body: CreateVariantBodyInput = { sku, attributes, ...(gross !== undefined ? { defaultGrossWeight: gross } : {}), ...(net !== undefined ? { defaultNetWeight: net } : {}), isActive };
    const parsed = createVariantBodySchema.safeParse(body);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate(body);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit variant" : "Add variant"}</DialogTitle>
            <DialogDescription>A variant is a sellable variation of this product, with its own SKU.</DialogDescription>
          </DialogHeader>
          <FormField label="SKU" htmlFor="variant-sku" required error={errors.sku} hint={editing ? "The SKU can't be changed." : undefined}>
            <Input id="variant-sku" value={sku} onChange={(e) => setSku(e.target.value)} disabled={editing} invalid={!!errors.sku} className="font-mono uppercase" autoComplete="off" />
          </FormField>
          <FormField label="Attributes" error={errors.attributes} hint="What makes this variant different, e.g. size 14.">
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input aria-label={`Attribute ${i + 1} name`} placeholder="size" value={row.name} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} />
                  <Input aria-label={`Attribute ${i + 1} value`} placeholder="14" value={row.value} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove attribute ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div>
                <Button type="button" variant="secondary" size="sm" onClick={() => setRows([...rows, { name: "", value: "" }])}>
                  <Plus className="h-4 w-4" /> Add attribute
                </Button>
              </div>
            </div>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Gross weight" htmlFor="variant-gross" error={errors.defaultGrossWeight}>
              <WeightInput id="variant-gross" value={gross} onValueChange={setGross} />
            </FormField>
            <FormField label="Net weight" htmlFor="variant-net" error={errors.defaultNetWeight}>
              <WeightInput id="variant-net" value={net} onValueChange={setNet} />
            </FormField>
          </div>
          <label className="flex items-center justify-between gap-4">
            <span className="text-body font-medium">Active</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Active" />
          </label>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? "Save variant" : "Add variant"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
