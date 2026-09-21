"use client";

import * as React from "react";
import type { PricingPlaygroundMeta } from "@jewellery/types";
import { Card, FormField, FormSection, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsList, TabsTrigger } from "@jewellery/ui";
import { EXAMPLES, exampleToForm } from "../../lib/pricing/examples";
import type { BuiltRequest, DiscountMode, MakingMode, PlaygroundForm, WastageMode } from "../../lib/pricing/playground";

const MAKING_OPTIONS: { value: MakingMode; label: string; unit?: string }[] = [
  { value: "RULE", label: "Use stored rules" },
  { value: "PERCENTAGE", label: "Percentage of metal value", unit: "%" },
  { value: "PER_GRAM", label: "Per gram", unit: "₹ / g" },
  { value: "FIXED", label: "Fixed amount", unit: "₹" },
  { value: "PER_PIECE", label: "Per piece", unit: "₹ / piece" },
];
const WASTAGE_OPTIONS: { value: WastageMode; label: string; unit?: string }[] = [
  { value: "RULE", label: "Use stored rules" },
  { value: "NONE", label: "No wastage" },
  { value: "PERCENTAGE", label: "Percentage of net weight", unit: "%" },
  { value: "FIXED_WEIGHT", label: "Fixed weight", unit: "g" },
];
const DISCOUNT_OPTIONS: { value: DiscountMode; label: string; unit?: string }[] = [
  { value: "RULE", label: "Use stored rules" },
  { value: "PERCENTAGE", label: "Percentage", unit: "%" },
  { value: "FLAT", label: "Flat amount", unit: "₹" },
];

interface Props {
  form: PlaygroundForm;
  errors: BuiltRequest["errors"];
  meta: PricingPlaygroundMeta | undefined;
  onChange: (patch: Partial<PlaygroundForm>) => void;
  onReplace: (form: PlaygroundForm) => void;
}

const num = (extra = "") => `text-right tabular ${extra}`;

/** The playground's inputs. Plain strings in, no arithmetic: what to send is decided by `buildPreviewRequest`, and every number comes back from the API. */
export function PlaygroundFormPanel({ form, errors, meta, onChange, onReplace }: Props) {
  const metal = meta?.metals.find((m) => m.id === form.metalId);
  const purities = metal?.purities ?? [];
  const set = <K extends keyof PlaygroundForm>(key: K) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value } as Partial<PlaygroundForm>);
  const text = (key: keyof PlaygroundForm, id: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Input id={id} value={form[key] as string} onChange={set(key)} invalid={!!errors[key]} {...props} />
  );
  const unit = (options: { value: string; unit?: string }[], mode: string) => options.find((o) => o.value === mode)?.unit;

  return (
    <Card className="flex flex-col gap-5 p-5" data-testid="playground-form">
      <FormField label="Start from an example" htmlFor="pg-example" hint="Sample figures to edit — not live rates.">
        <Select value="" onValueChange={(id) => { const ex = EXAMPLES.find((e) => e.id === id); if (ex) onReplace(exampleToForm(ex, meta)); }}>
          <SelectTrigger id="pg-example" aria-label="Start from an example"><SelectValue placeholder="Choose an example…" /></SelectTrigger>
          <SelectContent>{EXAMPLES.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}</SelectContent>
        </Select>
      </FormField>

      <FormSection title="Piece">
        <FormField label="Metal" htmlFor="pg-metal" required>
          <Select value={form.metalId} onValueChange={(metalId) => onChange({ metalId, purity: "", ratePurity: "" })}>
            <SelectTrigger id="pg-metal" aria-label="Metal"><SelectValue placeholder="Choose a metal" /></SelectTrigger>
            <SelectContent>{(meta?.metals ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label="Purity" htmlFor="pg-purity" required>
          <Select value={form.purity} onValueChange={(purity) => onChange({ purity, ...(form.ratePurity ? {} : { ratePurity: purity }) })} disabled={!metal}>
            <SelectTrigger id="pg-purity" aria-label="Purity"><SelectValue placeholder={metal ? "Choose a purity" : "Choose a metal first"} /></SelectTrigger>
            <SelectContent>{purities.map((p) => <SelectItem key={p.code} value={p.code}>{p.code} · {p.fineness}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label="Gross weight (g)" htmlFor="pg-gross" required error={errors.grossWeight} hint="Up to 3 decimals.">{text("grossWeight", "pg-gross", { inputMode: "decimal", className: num() })}</FormField>
        <FormField label="Stone weight (g)" htmlFor="pg-stone-weight" error={errors.stoneWeight} hint="Net weight = gross − stones.">{text("stoneWeight", "pg-stone-weight", { inputMode: "decimal", className: num(), placeholder: "0" })}</FormField>
        <FormField label="Pieces" htmlFor="pg-pieces" error={errors.pieces} hint="Weights are for all pieces together.">{text("pieces", "pg-pieces", { inputMode: "numeric", className: num() })}</FormField>
        <FormField label="Cost (₹)" htmlFor="pg-cost" error={errors.cost} hint="Optional — shows margin.">{text("cost", "pg-cost", { inputMode: "decimal", className: num() })}</FormField>
      </FormSection>

      <FormSection title="Metal rate">
        <FormField label="Rate (₹ per gram)" htmlFor="pg-rate" required error={errors.rate}>{text("rate", "pg-rate", { inputMode: "decimal", className: num() })}</FormField>
        <FormField label="Rate is quoted for" htmlFor="pg-rate-purity" required hint="Other purities are derived from it.">
          <Select value={form.ratePurity} onValueChange={(ratePurity) => onChange({ ratePurity })} disabled={!metal}>
            <SelectTrigger id="pg-rate-purity" aria-label="Rate quoted for"><SelectValue placeholder="Choose a purity" /></SelectTrigger>
            <SelectContent>{purities.map((p) => <SelectItem key={p.code} value={p.code}>{p.code} · {p.fineness}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
      </FormSection>

      <FormSection title="Charges" description="Leave a charge on “Use stored rules” to see which pricing rule applies to this customer type.">
        <FormField label="Making" htmlFor="pg-making-mode">
          <Select value={form.makingMode} onValueChange={(makingMode) => onChange({ makingMode: makingMode as MakingMode })}>
            <SelectTrigger id="pg-making-mode" aria-label="Making"><SelectValue /></SelectTrigger>
            <SelectContent>{MAKING_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label={`Making value${unit(MAKING_OPTIONS, form.makingMode) ? ` (${unit(MAKING_OPTIONS, form.makingMode)})` : ""}`} htmlFor="pg-making-value" error={errors.makingValue}>
          {text("makingValue", "pg-making-value", { inputMode: "decimal", className: num(), disabled: form.makingMode === "RULE" })}
        </FormField>
        <FormField label="Wastage" htmlFor="pg-wastage-mode">
          <Select value={form.wastageMode} onValueChange={(wastageMode) => onChange({ wastageMode: wastageMode as WastageMode })}>
            <SelectTrigger id="pg-wastage-mode" aria-label="Wastage"><SelectValue /></SelectTrigger>
            <SelectContent>{WASTAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label={`Wastage value${unit(WASTAGE_OPTIONS, form.wastageMode) ? ` (${unit(WASTAGE_OPTIONS, form.wastageMode)})` : ""}`} htmlFor="pg-wastage-value" error={errors.wastageValue}>
          {text("wastageValue", "pg-wastage-value", { inputMode: "decimal", className: num(), disabled: form.wastageMode === "RULE" || form.wastageMode === "NONE" })}
        </FormField>
        <FormField label="Stone value (₹)" htmlFor="pg-stone-value" error={errors.stoneValue} className="sm:col-span-2">{text("stoneValue", "pg-stone-value", { inputMode: "decimal", className: num(), placeholder: "0" })}</FormField>
        <FormField label="Discount" htmlFor="pg-discount-mode">
          <Select value={form.discountMode} onValueChange={(discountMode) => onChange({ discountMode: discountMode as DiscountMode })}>
            <SelectTrigger id="pg-discount-mode" aria-label="Discount"><SelectValue /></SelectTrigger>
            <SelectContent>{DISCOUNT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label={`Discount value${unit(DISCOUNT_OPTIONS, form.discountMode) ? ` (${unit(DISCOUNT_OPTIONS, form.discountMode)})` : ""}`} htmlFor="pg-discount-value" error={errors.discountValue}>
          {text("discountValue", "pg-discount-value", { inputMode: "decimal", className: num(), disabled: form.discountMode === "RULE" })}
        </FormField>
        {form.discountMode !== "RULE" && (
          <FormField label="Discount applies to" htmlFor="pg-discount-applies" className="sm:col-span-2">
            <Select value={form.discountAppliesTo} onValueChange={(discountAppliesTo) => onChange({ discountAppliesTo: discountAppliesTo as PlaygroundForm["discountAppliesTo"] })}>
              <SelectTrigger id="pg-discount-applies" aria-label="Discount applies to"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="TOTAL">The whole subtotal</SelectItem><SelectItem value="MAKING_CHARGES">Making charges only</SelectItem></SelectContent>
            </Select>
          </FormField>
        )}
      </FormSection>

      <FormSection title="Customer & tax">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-body-sm font-medium">Customer type</span>
          <Tabs value={form.customerType} onValueChange={(v) => onChange({ customerType: v as PlaygroundForm["customerType"] })}>
            <TabsList aria-label="Customer type"><TabsTrigger value="B2C">B2C · retail</TabsTrigger><TabsTrigger value="B2B">B2B · wholesale</TabsTrigger></TabsList>
          </Tabs>
        </div>
        <FormField label="HSN code" htmlFor="pg-hsn" required error={errors.hsnCode}>{text("hsnCode", "pg-hsn", { inputMode: "numeric", className: "font-mono" })}</FormField>
        <div className="hidden sm:block" aria-hidden="true" />
        <FormField label="CGST (%)" htmlFor="pg-cgst" required error={errors.cgst}>{text("cgst", "pg-cgst", { inputMode: "decimal", className: num() })}</FormField>
        <FormField label="SGST (%)" htmlFor="pg-sgst" required error={errors.sgst}>{text("sgst", "pg-sgst", { inputMode: "decimal", className: num() })}</FormField>
        <FormField label="IGST (%)" htmlFor="pg-igst" required error={errors.igst} className="sm:col-span-2" hint="Entered as the tax master lists them: CGST + SGST must equal IGST.">{text("igst", "pg-igst", { inputMode: "decimal", className: num() })}</FormField>
        <FormField label="Seller state" htmlFor="pg-seller" required>{text("sellerState", "pg-seller")}</FormField>
        <FormField label="Buyer state" htmlFor="pg-buyer" required hint="Same state → CGST + SGST; otherwise IGST.">{text("buyerState", "pg-buyer")}</FormField>
      </FormSection>
    </Card>
  );
}
