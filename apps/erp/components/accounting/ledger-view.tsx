"use client";

import * as React from "react";
import { PageHeader } from "@jewellery/ui";
import { useChartOfAccounts, useJournal, useTrialBalance } from "../../lib/api/accounting";
import { Load, Table, Td, Th, day, rupees } from "./shared";

const REFERENCE_TYPES = ["", "SALES_INVOICE", "PAYMENT_RECEIVED", "PURCHASE_INVOICE", "PAYMENT_MADE", "CREDIT_NOTE", "DEBIT_NOTE"] as const;

/**
 * Every posted journal entry, filterable by account and reference type — read-only, since nothing
 * here writes a journal entry directly (every entry traces back to a real commercial document).
 * The trial balance alongside it is the honest proof the ledger actually balances: `postJournal`
 * refuses anything that doesn't, so this should always foot to zero.
 */
export function LedgerView() {
  const accounts = useChartOfAccounts();
  const [accountId, setAccountId] = React.useState("");
  const [referenceType, setReferenceType] = React.useState<string>("");
  const journal = useJournal({ ...(accountId ? { accountId } : {}), ...(referenceType ? { referenceType } : {}) });
  const tb = useTrialBalance();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="General Ledger" description="Every posted accounting entry — each one debits and credits to the paisa." />

      <Load q={tb} rows={3}>
        {tb.data && (
          <div className="flex flex-col gap-2">
            <h3 className="text-h4 font-semibold">Trial balance {tb.data.totalDebit === tb.data.totalCredit ? <span className="text-success">— balances</span> : <span className="text-danger">— does not balance</span>}</h3>
            <Table testId="trial-balance"><thead><tr><Th>Code</Th><Th>Account</Th><Th>Type</Th><Th right>Debit</Th><Th right>Credit</Th><Th right>Balance</Th></tr></thead><tbody>
              {tb.data.rows.map((r) => (
                <tr key={r.accountId}>
                  <Td className="tabular">{r.code}</Td>
                  <Td className="font-medium">{r.name}</Td>
                  <Td className="text-muted">{r.type}</Td>
                  <Td right>{rupees(r.debit)}</Td>
                  <Td right>{rupees(r.credit)}</Td>
                  <Td right className="font-medium">{rupees(r.balance)}</Td>
                </tr>
              ))}
              <tr className="font-semibold"><td className="border-b border-border-subtle px-3 py-2.5 text-body-sm" colSpan={3}>Total</td><Td right>{rupees(tb.data.totalDebit)}</Td><Td right>{rupees(tb.data.totalCredit)}</Td><Td /></tr>
            </tbody></Table>
          </div>
        )}
      </Load>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-h4 font-semibold">Journal</h3>
          <select className="ml-auto h-9 rounded-md border border-border bg-surface px-3 text-body-sm" value={accountId} onChange={(e) => setAccountId(e.target.value)} data-testid="ledger-account-filter">
            <option value="">All accounts</option>
            {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
          <select className="h-9 rounded-md border border-border bg-surface px-3 text-body-sm" value={referenceType} onChange={(e) => setReferenceType(e.target.value)} data-testid="ledger-reftype-filter">
            {REFERENCE_TYPES.map((r) => <option key={r} value={r}>{r ? r.replace(/_/g, " ") : "All types"}</option>)}
          </select>
        </div>
        <Load q={journal}>
          {(journal.data ?? []).length === 0 ? <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted">No entries match.</p> : (
            <div className="flex flex-col gap-3">
              {(journal.data ?? []).map((j) => (
                <div key={j.id} className="rounded-lg border border-border-subtle bg-surface p-3" data-testid="journal-entry">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm">
                    <span className="font-medium">{j.journalNo}</span>
                    <span className="text-muted">{day(j.date)} · {j.referenceType.replace(/_/g, " ")}{j.referenceLabel && ` · ${j.referenceLabel}`}</span>
                  </div>
                  <p className="text-caption text-muted">{j.narration}</p>
                  <Table><thead><tr><Th>Account</Th><Th right>Debit</Th><Th right>Credit</Th></tr></thead><tbody>
                    {j.lines.map((l, i) => (
                      <tr key={i}>
                        <Td>{l.accountCode} — {l.accountName}</Td>
                        <Td right>{l.direction === "DEBIT" ? rupees(l.amount) : ""}</Td>
                        <Td right>{l.direction === "CREDIT" ? rupees(l.amount) : ""}</Td>
                      </tr>
                    ))}
                  </tbody></Table>
                </div>
              ))}
            </div>
          )}
        </Load>
      </div>
    </div>
  );
}
