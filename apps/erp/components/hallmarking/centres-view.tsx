"use client";

import * as React from "react";
import { PERMISSIONS as P } from "@jewellery/types";
import { useInventoryMeta } from "../../lib/api/inventory-queries";
import { hallmarkingApi, useAssayingCentres, useHallmarkingAction } from "../../lib/api/hallmarking";
import { errorMessage } from "../../lib/api/queries";
import { useAuth } from "../../lib/auth/auth-context";
import { Field, Load, Table, Td, Th, btn, inputCls } from "./shared";

/** Assaying centres are reference data (CLAUDE.md: compliance/regulatory configuration is never hardcoded) — a new BIS centre, or one that's closed, is a data change here, not a code change. */
function NewCentreForm({ onDone }: { onDone: () => void }) {
  const meta = useInventoryMeta();
  const centreLocations = (meta.data?.locations ?? []).filter((l) => l.type === "HALLMARKING_CENTER");
  const [f, setF] = React.useState({ name: "", code: "", bisRegistrationNumber: "", locationId: "", contactPhone: "", contactEmail: "" });
  const [err, setErr] = React.useState<string>();
  const create = useHallmarkingAction(hallmarkingApi.createCentre, "Assaying centre added", onDone);

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3" data-testid="new-centre-form">
      <h3 className="text-h4 font-semibold sm:col-span-3">New assaying centre</h3>
      {centreLocations.length === 0 && (
        <p className="text-body-sm text-warning sm:col-span-3">No location of type &quot;Hallmarking Centre&quot; exists yet — create one under Settings first.</p>
      )}
      <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="centre-name" /></Field>
      <Field label="Code"><input className={inputCls} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} data-testid="centre-code" /></Field>
      <Field label="BIS registration no."><input className={inputCls} value={f.bisRegistrationNumber} onChange={(e) => setF({ ...f, bisRegistrationNumber: e.target.value })} data-testid="centre-bis" /></Field>
      <Field label="Location">
        <select className={inputCls} value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })} data-testid="centre-location">
          <option value="">Select…</option>
          {centreLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Field>
      <Field label="Contact phone"><input className={inputCls} value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} /></Field>
      <Field label="Contact email"><input className={inputCls} value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} /></Field>
      {err && <p className="text-body-sm text-danger sm:col-span-3" role="alert">{err}</p>}
      <div className="sm:col-span-3">
        <button
          className={btn("primary")}
          disabled={!f.name.trim() || !f.code.trim() || !f.locationId || create.isPending}
          onClick={() =>
            create.mutate(
              { name: f.name.trim(), code: f.code.trim(), locationId: f.locationId, ...(f.bisRegistrationNumber.trim() ? { bisRegistrationNumber: f.bisRegistrationNumber.trim() } : {}), ...(f.contactPhone.trim() ? { contactPhone: f.contactPhone.trim() } : {}), ...(f.contactEmail.trim() ? { contactEmail: f.contactEmail.trim() } : {}) } as never,
              { onError: (e) => setErr(errorMessage(e)) }
            )
          }
          data-testid="centre-save"
        >
          Save centre
        </button>
      </div>
    </div>
  );
}

export function AssayingCentresView() {
  const { can } = useAuth();
  const q = useAssayingCentres();
  const [creating, setCreating] = React.useState(false);
  const toggleActive = useHallmarkingAction((v: { id: string; isActive: boolean }) => hallmarkingApi.updateCentre(v.id, { isActive: v.isActive }), "Centre updated");

  return (
    <div className="flex flex-col gap-4">
      {can(P.INVENTORY_CREATE) && (
        <div><button className={btn("primary")} onClick={() => setCreating((v) => !v)} data-testid="centre-new">{creating ? "Close" : "New assaying centre"}</button></div>
      )}
      {creating && <NewCentreForm onDone={() => { setCreating(false); q.refetch(); }} />}
      <Load q={q}>
        <Table testId="centres-table"><thead><tr><Th>Centre</Th><Th>Code</Th><Th>BIS reg.</Th><Th>Location</Th><Th>Contact</Th><Th right>Status</Th></tr></thead><tbody>
          {(q.data ?? []).map((c) => (
            <tr key={c.id} data-testid="centre-row">
              <Td className="font-medium">{c.name}</Td>
              <Td className="font-mono">{c.code}</Td>
              <Td className="text-muted">{c.bisRegistrationNumber ?? "—"}</Td>
              <Td>{c.locationName}</Td>
              <Td className="text-muted">{c.contactPhone ?? c.contactEmail ?? "—"}</Td>
              <Td right>
                {can(P.INVENTORY_CREATE) ? (
                  <button className={btn()} disabled={toggleActive.isPending} onClick={() => toggleActive.mutate({ id: c.id, isActive: !c.isActive })} data-testid="centre-toggle-active">
                    {c.isActive ? "Active" : "Inactive"}
                  </button>
                ) : c.isActive ? "Active" : "Inactive"}
              </Td>
            </tr>
          ))}
          {(q.data ?? []).length === 0 && <tr><td colSpan={6} className="border-b border-border-subtle px-3 py-2.5 text-body-sm text-muted">No assaying centres yet.</td></tr>}
        </tbody></Table>
      </Load>
    </div>
  );
}
