"use client";

import * as React from "react";
import Link from "next/link";
import { PERMISSIONS as P } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { purchasingApi, useSuppliers, usePurchasingAction } from "../../lib/api/purchasing";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, Table, Td, Th, btn, inputCls, money0 } from "./shared";

function NewSupplierForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = React.useState({ name: "", gstin: "", contactName: "", contactEmail: "", contactPhone: "", paymentTermsDays: "30" });
  const [err, setErr] = React.useState<string>();
  const create = usePurchasingAction(purchasingApi.createSupplier, "Supplier added", onDone);
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3" data-testid="new-supplier-form">
      <h3 className="text-h4 font-semibold sm:col-span-3">New supplier</h3>
      <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="supplier-name" /></Field>
      <Field label="GSTIN"><input className={inputCls} value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} data-testid="supplier-gstin" /></Field>
      <Field label="Payment terms (days)"><input className={inputCls} inputMode="numeric" value={f.paymentTermsDays} onChange={(e) => setF({ ...f, paymentTermsDays: e.target.value })} /></Field>
      <Field label="Contact name"><input className={inputCls} value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></Field>
      <Field label="Contact email"><input className={inputCls} value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} /></Field>
      <Field label="Contact phone"><input className={inputCls} value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} /></Field>
      {err && <p className="text-body-sm text-danger sm:col-span-3" role="alert">{err}</p>}
      <div className="sm:col-span-3">
        <button
          className={btn("primary")}
          disabled={!f.name.trim() || create.isPending}
          onClick={() =>
            create.mutate(
              { name: f.name.trim(), paymentTermsDays: Number(f.paymentTermsDays) || 0, ...(f.gstin.trim() ? { gstin: f.gstin.trim() } : {}), ...(f.contactName.trim() ? { contactName: f.contactName.trim() } : {}), ...(f.contactEmail.trim() ? { contactEmail: f.contactEmail.trim() } : {}), ...(f.contactPhone.trim() ? { contactPhone: f.contactPhone.trim() } : {}) } as never,
              { onError: (e) => setErr(errorMessage(e)) }
            )
          }
          data-testid="supplier-save"
        >
          Save supplier
        </button>
      </div>
    </div>
  );
}

export function SuppliersView() {
  const { can } = useAuth();
  const q = useSuppliers();
  const [creating, setCreating] = React.useState(false);
  return (
    <div className="flex flex-col gap-4">
      {can(P.PURCHASING_CREATE) && (
        <div><button className={btn("primary")} onClick={() => setCreating((v) => !v)} data-testid="supplier-new">{creating ? "Close" : "New supplier"}</button></div>
      )}
      {creating && <NewSupplierForm onDone={() => { setCreating(false); q.refetch(); }} />}
      <Load q={q}>
        <Table testId="suppliers-table"><thead><tr><Th>Supplier</Th><Th>GSTIN</Th><Th>Terms</Th><Th right>Owed</Th><Th right>Overdue</Th></tr></thead><tbody>
          {(q.data ?? []).map((s) => (
            <tr key={s.id} data-testid="supplier-row">
              <Td className="font-medium"><Link className="hover:underline" href={`/purchasing/outstanding?supplierId=${s.id}`}>{s.name}</Link>{!s.isActive && <span className="ml-2 text-caption text-muted">inactive</span>}</Td>
              <Td className="text-muted">{s.gstin ?? "—"}</Td>
              <Td>Net {s.paymentTermsDays}</Td>
              <Td right>{money0(s.totalOwed)}</Td>
              <Td right className={s.overdue ? "text-danger" : undefined}>{money0(s.overdue)}</Td>
            </tr>
          ))}
        </tbody></Table>
      </Load>
    </div>
  );
}
