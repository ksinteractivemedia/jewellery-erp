"use client";

import * as React from "react";
import { PageHeader } from "@jewellery/ui";
import { PERMISSIONS as P } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { useCreateMetalRate, useCurrentRate, useMetalsMeta, useRateHistory } from "../../lib/api/metals";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, Table, Td, Th, btn, inputCls } from "../shared/kit";

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v: string) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Metal rate entry — the one figure everything else in the system prices against (checkout, the B2B
 * catalogue, every sales/profitability report). Rates are append-only: entering a new one doesn't edit
 * history, it becomes the current rate as of its own effective date.
 */
export function GoldRatesView() {
  const { can } = useAuth();
  const canManage = can(P.PRICING_MANAGE);
  const meta = useMetalsMeta();
  const [metalId, setMetalId] = React.useState("");
  const [purity, setPurity] = React.useState("");
  const metal = meta.data?.metals.find((m) => m.id === metalId);

  React.useEffect(() => {
    if (!metalId && meta.data?.metals[0]) setMetalId(meta.data.metals[0].id);
  }, [metalId, meta.data]);
  React.useEffect(() => {
    if (metal && !metal.purities.some((p) => p.code === purity)) setPurity(metal.purities[0]?.code ?? "");
  }, [metal, purity]);

  const current = useCurrentRate(metalId, purity);
  const history = useRateHistory(metalId, purity);

  const [rate, setRate] = React.useState("");
  const [effectiveFrom, setEffectiveFrom] = React.useState(today());
  const [error, setError] = React.useState<string>();
  const create = useCreateMetalRate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    const value = Number(rate);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a rate greater than zero.");
    create.mutate(
      { metalId, purity, ratePerGram: value, effectiveFrom, source: "MANUAL" },
      { onSuccess: () => setRate(""), onError: (e) => setError(errorMessage(e)) }
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Gold Rates" description="Today's metal rate, by purity — every price in the system (storefront, wholesale catalogue, reports) reads from this." />
      <Load q={meta} rows={3}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Metal">
            <select className={inputCls} value={metalId} onChange={(e) => setMetalId(e.target.value)} data-testid="rate-metal">
              {(meta.data?.metals ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Purity">
            <select className={inputCls} value={purity} onChange={(e) => setPurity(e.target.value)} data-testid="rate-purity">
              {(metal?.purities ?? []).map((p) => <option key={p.code} value={p.code}>{p.code} ({(p.fineness * 100).toFixed(1)}%)</option>)}
            </select>
          </Field>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4" data-testid="current-rate">
          <p className="text-body-sm text-muted">Current rate — {metal?.name} {purity}</p>
          <Load q={current} rows={1}>
            <p className="mt-1 text-h2 font-display tabular text-foreground">
              {current.data ? `${rupees(current.data.ratePerGram)}/g` : "No rate entered yet"}
            </p>
            {current.data && <p className="text-caption text-muted">Effective {day(current.data.effectiveFrom as unknown as string)}</p>}
          </Load>
        </div>

        {canManage && (
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4" data-testid="rate-form">
            <Field label="New rate (₹ per gram)">
              <input className={inputCls} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 6500" data-testid="rate-input" />
            </Field>
            <Field label="Effective from">
              <input type="date" className={inputCls} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} data-testid="rate-effective-from" />
            </Field>
            <button type="submit" className={btn("primary")} disabled={create.isPending || !metalId || !purity} data-testid="rate-submit">
              {create.isPending ? "Saving…" : "Record rate"}
            </button>
            {error && <p className="w-full text-body-sm text-danger" role="alert" data-testid="rate-error">{error}</p>}
          </form>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-h4 font-semibold">History</h3>
          <Load q={history}>
            {(history.data ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-body-sm text-muted">No rate has been entered for this purity yet.</p>
            ) : (
              <Table testId="rate-history-table">
                <thead><tr><Th>Effective from</Th><Th right>Rate / g</Th><Th>Source</Th></tr></thead>
                <tbody>
                  {[...(history.data ?? [])].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)).map((r) => (
                    <tr key={r.id} data-testid="rate-history-row">
                      <Td>{day(r.effectiveFrom as unknown as string)}</Td>
                      <Td right className="tabular">{rupees(r.ratePerGram)}</Td>
                      <Td>{r.source === "MANUAL" ? "Manual" : "Feed"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Load>
        </div>
      </Load>
    </div>
  );
}
