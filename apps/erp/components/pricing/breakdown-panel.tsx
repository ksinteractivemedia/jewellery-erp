"use client";

import * as React from "react";
import type { PriceBreakdown } from "@jewellery/types";
import { Alert, Badge, Card, formatCurrency, formatWeight } from "@jewellery/ui";
import { describeDiscount, describeMaking, describeSource, describeWastage } from "../../lib/pricing/describe";
import { rupees } from "../../lib/inventory/format";

const money = (paise: number) => formatCurrency(rupees(paise), { precise: true });

function Line({ id, label, detail, value, negative, strong }: { id: string; label: string; detail?: React.ReactNode; value: string; negative?: boolean; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? "border-t border-border pt-2.5 font-medium" : ""}`} data-testid={`bd-${id}`}>
      <dt className="flex flex-col">
        <span className={strong ? "text-body text-foreground" : "text-body-sm text-foreground"}>{label}</span>
        {detail && <span className="text-caption text-muted">{detail}</span>}
      </dt>
      <dd className={`tabular text-right ${strong ? "text-body" : "text-body-sm"} ${negative ? "text-success" : "text-foreground"}`}>{negative ? "− " : ""}{value}</dd>
    </div>
  );
}

/**
 * The complete price the engine returned — every component, in the order it was calculated, with the rule
 * that supplied each charge. It only displays: the API's pricing engine produced every number here.
 */
export function BreakdownPanel({ breakdown: b, stale }: { breakdown: PriceBreakdown; stale?: boolean }) {
  const { making, wastage, discount } = b.rules;
  const t = b.taxes;
  return (
    <div className={`flex flex-col gap-4 ${stale ? "opacity-60 transition-opacity" : ""}`} data-testid="breakdown" aria-busy={stale || undefined}>
      <Card className="flex flex-col gap-1 p-5">
        <span className="text-caption uppercase tracking-wide text-muted">Final amount</span>
        <span className="tabular text-h2 font-semibold text-foreground" data-testid="final-amount">{money(b.finalAmount)}</span>
        <span className="text-body-sm text-muted">{money(b.taxableValue)} taxable + {money(b.totalTax)} GST</span>
      </Card>

      {b.warnings.map((w) => <Alert key={w.code + w.message} variant="warning" title={w.code === "BELOW_COST" ? "Below cost" : w.code === "NO_MAKING_RULE" ? "No making charge rule" : "Ambiguous rules"} data-testid={`warning-${w.code}`}>{w.message}</Alert>)}

      <Card className="p-5">
        <h3 className="mb-1 text-body font-medium">Calculation</h3>
        <p className="mb-3 text-body-sm text-muted" data-testid="bd-basis">
          {formatWeight(b.weights.net)} net{b.weights.pieces > 1 ? ` across ${b.weights.pieces} pieces` : ""} · {formatWeight(b.weights.fine)} fine · rate {money(b.rate.ratePerGram)}/g for {b.rate.quotedPurity}
          {b.rate.effectiveRatePerGram !== b.rate.ratePerGram && <> → {formatCurrency(rupees(b.rate.effectiveRatePerGram), { precise: true })}/g at this purity</>}
        </p>
        <dl className="flex flex-col divide-y divide-border-subtle">
          <Line id="metal-value" label="Metal value" detail={`${formatWeight(b.weights.net)} × rate at this purity`} value={money(b.metalValue)} />
          <Line id="wastage" label="Wastage" detail={b.wastageWeight > 0 ? `${formatWeight(b.wastageWeight)} of metal` : "none"} value={money(b.wastageValue)} />
          <Line id="making" label="Making charges" detail={making ? describeMaking(making.terms) : "none"} value={money(b.makingCharges)} />
          <Line id="stone" label="Stone value" value={money(b.stoneValue)} />
          <Line id="subtotal" label="Subtotal" value={money(b.subtotal)} strong />
          <Line id="discount" label="Discount" detail={discount ? describeDiscount(discount.terms) : "none"} value={money(b.discount)} negative={b.discount > 0} />
          <Line id="taxable" label="Taxable value" value={money(b.taxableValue)} strong />
          {t.supplyType === "INTRA_STATE" ? (
            <>
              <Line id="cgst" label={`CGST @ ${t.cgstRate}%`} value={money(t.cgst)} />
              <Line id="sgst" label={`SGST @ ${t.sgstRate}%`} value={money(t.sgst)} />
            </>
          ) : (
            <Line id="igst" label={`IGST @ ${t.igstRate}%`} value={money(t.igst)} />
          )}
          <Line id="total-tax" label="Total tax" detail={<>HSN {t.hsnCode} · <Badge variant="neutral" data-testid="supply-type">{t.supplyType === "INTRA_STATE" ? "Within state" : "Inter-state"}</Badge></>} value={money(b.totalTax)} strong />
          <Line id="final" label="Final amount" value={money(b.finalAmount)} strong />
        </dl>
      </Card>

      <Card className="p-5" data-testid="bd-sources">
        <h3 className="mb-3 text-body font-medium">Where each charge came from</h3>
        <ul className="flex flex-col gap-2 text-body-sm">
          <li><span className="font-medium">Making:</span> {making ? <>{describeMaking(making.terms)} <span className="text-muted">— {describeSource(making.source)}</span></> : <span className="text-muted">no rule applied</span>}</li>
          <li><span className="font-medium">Wastage:</span> {wastage ? <>{describeWastage(wastage.terms)} <span className="text-muted">— {describeSource(wastage.source)}</span></> : <span className="text-muted">no rule applied</span>}</li>
          <li><span className="font-medium">Discount:</span> {discount ? <>{describeDiscount(discount.terms)} <span className="text-muted">— {describeSource(discount.source)}</span></> : <span className="text-muted">no rule applied</span>}</li>
        </ul>
      </Card>

      <Card className="p-5" data-testid="margin-card">
        <h3 className="mb-1 text-body font-medium">Cost &amp; margin <Badge variant="neutral">Internal</Badge></h3>
        {b.estimatedCost === null ? (
          <p className="text-body-sm text-muted">Enter the item’s cost to see the margin.</p>
        ) : (
          <dl className="flex flex-col divide-y divide-border-subtle">
            <Line id="cost" label="Estimated cost" value={money(b.estimatedCost)} />
            <Line id="margin" label="Gross margin" detail="taxable value − cost" value={money(b.grossMargin ?? 0)} />
            <Line id="margin-pct" label="Margin" detail="of the taxable value" value={b.marginPercentage === null ? "—" : `${b.marginPercentage.toFixed(2)}%`} />
          </dl>
        )}
      </Card>
    </div>
  );
}
