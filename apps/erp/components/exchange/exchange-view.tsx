"use client";

import * as React from "react";
import { Repeat } from "lucide-react";
import { EmptyState, PageHeader } from "@jewellery/ui";
import { PERMISSIONS as P } from "@jewellery/types";
import type { Exchange } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { useCatalogMeta } from "../../lib/api/queries";
import { useInventoryMeta } from "../../lib/api/inventory-queries";
import { exchangeApi, useExchangeAction, useExchangeDashboard, useExchanges } from "../../lib/api/exchange";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, Status, Table, Td, Th, btn, day, grams, inputCls, rupees } from "./shared";

const SETTLEMENT_METHODS = ["CASH", "CARD", "UPI", "BANK_TRANSFER", "CHEQUE", "STORE_CREDIT"] as const;
const TABS = [["", "All"], ["DRAFT", "Draft"], ["ASSESSED", "Assessed"], ["COMPLETED", "Completed"]] as const;

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-body-sm text-muted">{label}</p>
      <p className="mt-1 text-h3 font-display tabular text-foreground">{value}</p>
    </div>
  );
}

interface Assessment {
  description: string;
  metalId: string;
  claimedPurity: string;
  grossWeight: string;
  stoneWeight: string;
  assessedPurity: string;
  ratePerGram: string;
  deduction: string;
  notes: string;
}
const blankAssessment: Assessment = { description: "", metalId: "", claimedPurity: "", grossWeight: "", stoneWeight: "0", assessedPurity: "", ratePerGram: "", deduction: "0", notes: "" };

function AssessmentFields({ v, set, metals }: { v: Assessment; set: (p: Partial<Assessment>) => void; metals: { id: string; name: string; purities: string[] }[] }) {
  const metal = metals.find((m) => m.id === v.metalId);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Description"><input className={inputCls} value={v.description} onChange={(e) => set({ description: e.target.value })} data-testid="ex-description" /></Field>
      <Field label="Metal">
        <select className={inputCls} value={v.metalId} onChange={(e) => set({ metalId: e.target.value, assessedPurity: "" })} data-testid="ex-metal">
          <option value="">Choose…</option>
          {metals.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Assessed purity">
        <select className={inputCls} value={v.assessedPurity} onChange={(e) => set({ assessedPurity: e.target.value })} data-testid="ex-purity" disabled={!metal}>
          <option value="">Choose…</option>
          {(metal?.purities ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>
      <Field label="Claimed purity (optional)"><input className={inputCls} value={v.claimedPurity} onChange={(e) => set({ claimedPurity: e.target.value })} data-testid="ex-claimed" /></Field>
      <Field label="Gross weight (g)"><input type="number" step="0.001" className={inputCls} value={v.grossWeight} onChange={(e) => set({ grossWeight: e.target.value })} data-testid="ex-gross" /></Field>
      <Field label="Stone weight (g)"><input type="number" step="0.001" className={inputCls} value={v.stoneWeight} onChange={(e) => set({ stoneWeight: e.target.value })} data-testid="ex-stone" /></Field>
      <Field label="Rate per gram (₹, at this purity)"><input type="number" step="0.01" className={inputCls} value={v.ratePerGram} onChange={(e) => set({ ratePerGram: e.target.value })} data-testid="ex-rate" /></Field>
      <Field label="Deduction (₹, optional)"><input type="number" step="0.01" className={inputCls} value={v.deduction} onChange={(e) => set({ deduction: e.target.value })} data-testid="ex-deduction" /></Field>
      <Field label="Notes"><input className={inputCls} value={v.notes} onChange={(e) => set({ notes: e.target.value })} data-testid="ex-notes" /></Field>
    </div>
  );
}

const toPayload = (v: Assessment) => ({
  description: v.description,
  metalId: v.metalId,
  ...(v.claimedPurity ? { claimedPurity: v.claimedPurity } : {}),
  grossWeight: Number(v.grossWeight),
  stoneWeight: Number(v.stoneWeight || 0),
  assessedPurity: v.assessedPurity,
  ratePerGram: Math.round(Number(v.ratePerGram || 0) * 100),
  deduction: Math.round(Number(v.deduction || 0) * 100),
  ...(v.notes ? { notes: v.notes } : {}),
});

function NewExchangeForm({ onDone }: { onDone: (ex: Exchange) => void }) {
  const meta = useCatalogMeta();
  const metals = meta.data?.metals ?? [];
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [v, setV] = React.useState<Assessment>(blankAssessment);
  const [err, setErr] = React.useState<string>();
  const create = useExchangeAction(exchangeApi.create, "Old jewellery assessed", (ex) => onDone(ex as Exchange));
  const canSubmit = name.trim() && v.description && v.metalId && v.assessedPurity && v.grossWeight && v.ratePerGram;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" data-testid="new-exchange-form">
      <h3 className="text-h4 font-semibold">Old jewellery → assessment</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} data-testid="ex-customer-name" /></Field>
        <Field label="Phone"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="ex-customer-phone" /></Field>
      </div>
      <AssessmentFields v={v} set={(p) => setV((cur) => ({ ...cur, ...p }))} metals={metals} />
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="exchange-form-error">{err}</p>}
      <div className="flex gap-2">
        <button
          className={btn("primary")}
          disabled={!canSubmit || create.isPending}
          onClick={() => create.mutate({ customer: { name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) }, oldJewellery: toPayload(v) } as never, { onError: (e) => setErr(errorMessage(e)) })}
          data-testid="exchange-save"
        >
          Assess
        </button>
      </div>
    </div>
  );
}

function CompleteForm({ ex, onDone, onCancel }: { ex: Exchange; onDone: () => void; onCancel: () => void }) {
  const invMeta = useInventoryMeta();
  const stockLocations = (invMeta.data?.locations ?? []).filter((l) => ["STORE", "WAREHOUSE", "COUNTER", "VAULT"].includes(l.type));
  const [locationId, setLocationId] = React.useState("");
  const [productId, setProductId] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [name, setName] = React.useState("");
  const [unitPrice, setUnitPrice] = React.useState("");
  const [method, setMethod] = React.useState<(typeof SETTLEMENT_METHODS)[number]>("CASH");
  const [reference, setReference] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const complete = useExchangeAction((v: Parameters<typeof exchangeApi.complete>[1]) => exchangeApi.complete(ex.id, v), "Exchange completed", onDone);
  const canSubmit = locationId && productId.trim().length === 24 && sku.trim() && name.trim() && unitPrice;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary bg-surface p-4" data-testid="complete-form">
      <h4 className="font-semibold">Complete {ex.exchangeNo} — new product & settlement</h4>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Take old piece into">
          <select className={inputCls} value={locationId} onChange={(e) => setLocationId(e.target.value)} data-testid="complete-location">
            <option value="">Choose…</option>
            {stockLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="New product id"><input className={inputCls} value={productId} onChange={(e) => setProductId(e.target.value.trim())} placeholder="24-character product id" data-testid="complete-product-id" /></Field>
        <Field label="SKU"><input className={inputCls} value={sku} onChange={(e) => setSku(e.target.value)} data-testid="complete-sku" /></Field>
        <Field label="Product name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} data-testid="complete-name" /></Field>
        <Field label="Unit price (₹)"><input type="number" step="0.01" className={inputCls} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} data-testid="complete-price" /></Field>
        <Field label="Settlement method">
          <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as (typeof SETTLEMENT_METHODS)[number])} data-testid="complete-method">
            {SETTLEMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <Field label="Reference (optional)"><input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} data-testid="complete-reference" /></Field>
      </div>
      <p className="text-body-sm text-muted">Old piece valued at {rupees(ex.oldJewellery.valuation)}. Difference is computed by the server: positive means the customer owes it, negative means the business does.</p>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="complete-error">{err}</p>}
      <div className="flex gap-2">
        <button
          className={btn("primary")}
          disabled={!canSubmit || complete.isPending}
          onClick={() =>
            complete.mutate(
              {
                locationId,
                newProduct: { productId, sku: sku.trim(), name: name.trim(), quantity: 1, unitPrice: Math.round(Number(unitPrice) * 100), lineTotal: Math.round(Number(unitPrice) * 100) },
                settlement: { method, ...(reference.trim() ? { reference: reference.trim() } : {}) },
              } as never,
              { onError: (e) => setErr(errorMessage(e)) }
            )
          }
          data-testid="complete-go"
        >
          Complete exchange
        </button>
        <button className={btn()} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Detail({ ex, onDone }: { ex: Exchange; onDone: () => void }) {
  const { can } = useAuth();
  const meta = useCatalogMeta();
  const metals = meta.data?.metals ?? [];
  const [mode, setMode] = React.useState<"none" | "assess" | "complete" | "cancel">("none");
  const [v, setV] = React.useState<Assessment>(blankAssessment);
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const done = () => { setMode("none"); setErr(undefined); onDone(); };
  const fail = (e: unknown) => setErr(errorMessage(e));
  const assess = useExchangeAction(() => exchangeApi.assess(ex.id, { oldJewellery: toPayload(v) }), "Re-assessed", done);
  const cancel = useExchangeAction(() => exchangeApi.cancel(ex.id, reason.trim() || undefined), "Cancelled", done);
  const write = can(P.EXCHANGE_CREATE);
  const canAssess = write && (ex.status === "DRAFT" || ex.status === "ASSESSED");
  const canComplete = write && ex.status === "ASSESSED";
  const canCancel = write && (ex.status === "DRAFT" || ex.status === "ASSESSED");

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" data-testid="exchange-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-h4 font-semibold">{ex.exchangeNo} <span className="font-normal text-muted">· {ex.customer.name}</span></h3>
        <Status s={ex.status} />
      </div>
      <div className="rounded-md border border-border-subtle p-3">
        <p className="font-medium">{ex.oldJewellery.description}</p>
        <p className="text-body-sm text-muted">{ex.oldJewellery.metalName} · {ex.oldJewellery.assessedPurity} · gross {grams(ex.oldJewellery.grossWeight)} · net {grams(ex.oldJewellery.netWeight)} · fine {grams(ex.oldJewellery.fineWeight)}</p>
        <p className="text-body-sm">Valuation: <strong>{rupees(ex.oldJewellery.valuation)}</strong>{ex.oldJewellery.deduction > 0 && ` (after ${rupees(ex.oldJewellery.deduction)} deduction)`}</p>
      </div>
      {ex.newProduct && (
        <div className="rounded-md border border-border-subtle p-3">
          <p className="font-medium">{ex.newProduct.name} <span className="font-normal text-muted">({ex.newProduct.sku})</span></p>
          <p className="text-body-sm">Sold at {rupees(ex.newProduct.lineTotal)}</p>
        </div>
      )}
      {ex.settlement && (
        <p className="text-body-sm">
          {ex.settlement.difference > 0 ? "Customer owes" : ex.settlement.difference < 0 ? "Business owes customer" : "No balance due"}: <strong>{rupees(Math.abs(ex.settlement.difference))}</strong>
          {ex.settlement.method && ` — ${ex.settlement.method.replace(/_/g, " ").toLowerCase()}`}{ex.settlement.reference && ` (${ex.settlement.reference})`}
        </p>
      )}
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="exchange-error">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {canAssess && <button className={btn()} onClick={() => { setV(blankAssessment); setMode("assess"); }} data-testid="exchange-reassess">Re-assess…</button>}
        {canComplete && <button className={btn("primary")} onClick={() => setMode("complete")} data-testid="exchange-complete">Complete…</button>}
        {canCancel && <button className={btn("danger")} onClick={() => setMode("cancel")} data-testid="exchange-cancel">Cancel…</button>}
      </div>
      {mode === "assess" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <AssessmentFields v={v} set={(p) => setV((cur) => ({ ...cur, ...p }))} metals={metals} />
          <div className="flex gap-2"><button className={btn("primary")} disabled={assess.isPending} onClick={() => assess.mutate(undefined, { onError: fail })} data-testid="assess-go">Save assessment</button><button className={btn()} onClick={() => setMode("none")}>Close</button></div>
        </div>
      )}
      {mode === "complete" && <CompleteForm ex={ex} onDone={done} onCancel={() => setMode("none")} />}
      {mode === "cancel" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <Field label="Reason (optional)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="exchange-cancel-reason" /></Field>
          <div className="flex gap-2"><button className={btn("danger")} disabled={cancel.isPending} onClick={() => cancel.mutate(undefined, { onError: fail })} data-testid="exchange-cancel-go">Confirm cancel</button><button className={btn()} onClick={() => setMode("none")}>Close</button></div>
        </div>
      )}
      {ex.history.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
          <h4 className="text-caption font-semibold uppercase tracking-wide text-muted">History</h4>
          {ex.history.map((h, i) => <p key={i} className="text-caption text-muted">{day(h.at)} — {h.status.replace(/_/g, " ").toLowerCase()} by {h.byName ?? "system"}{h.note && ` — ${h.note}`}</p>)}
        </div>
      )}
    </div>
  );
}

export function ExchangeView() {
  const [tab, setTab] = React.useState<string>("");
  const [creating, setCreating] = React.useState(false);
  const [sel, setSel] = React.useState<string>();
  const dash = useExchangeDashboard();
  const q = useExchanges(tab ? { status: tab } : {});
  const { can } = useAuth();
  const current = (q.data ?? []).find((e) => e.id === sel);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Exchanges" description="Old jewellery → inspection → weight/purity assessment → valuation → new product → difference payable/refundable." />
      <Load q={dash} rows={2}>
        {dash.data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Assessed" value={dash.data.counts.ASSESSED} />
            <Stat label="Completed" value={dash.data.counts.COMPLETED} />
            <Stat label="Cancelled" value={dash.data.counts.CANCELLED} />
            <Stat label="Total" value={Object.values(dash.data.counts).reduce((a, b) => a + b, 0)} />
          </div>
        )}
      </Load>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter">
          {TABS.map(([v, l]) => <button key={l} role="tab" aria-selected={tab === v} className={`h-8 rounded-full border px-3 text-caption ${tab === v ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`} onClick={() => setTab(v)} data-testid={`tab-${l.toLowerCase()}`}>{l}</button>)}
        </div>
        {can(P.EXCHANGE_CREATE) && <button className={btn("primary")} onClick={() => setCreating((v) => !v)} data-testid="exchange-new">{creating ? "Close" : "New exchange"}</button>}
      </div>
      {creating && <NewExchangeForm onDone={(ex) => { setCreating(false); setSel(ex.id); q.refetch(); dash.refetch(); }} />}
      <Load q={q}>
        {(q.data ?? []).length === 0 ? <EmptyState icon={<Repeat className="h-8 w-8" />} title="No exchanges yet" description="Start one from a customer's old jewellery to begin inspection and valuation." /> : (
          <Table testId="exchanges-table"><thead><tr><Th>Exchange</Th><Th>Customer</Th><Th>Old piece</Th><Th right>Valuation</Th><Th>Status</Th></tr></thead><tbody>
            {(q.data ?? []).map((e) => (
              <tr key={e.id} className={`cursor-pointer hover:bg-surface-sunken ${sel === e.id ? "bg-surface-sunken" : ""}`} onClick={() => setSel(e.id)} data-testid="exchange-row">
                <Td className="font-medium">{e.exchangeNo}</Td>
                <Td>{e.customer.name}</Td>
                <Td>{e.oldJewellery.description}</Td>
                <Td right>{rupees(e.oldJewellery.valuation)}</Td>
                <Td><Status s={e.status} /></Td>
              </tr>
            ))}
          </tbody></Table>
        )}
      </Load>
      {current && <Detail key={current.id + current.status} ex={current} onDone={() => { q.refetch(); dash.refetch(); }} />}
    </div>
  );
}
