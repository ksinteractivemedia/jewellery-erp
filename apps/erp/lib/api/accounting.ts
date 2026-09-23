"use client";

import { useQuery } from "@tanstack/react-query";
import type { AccountingEntry, AgeingReport, ChartOfAccount, CreditNote, DebitNote, OutstandingInvoiceRow, ReceivablesSummary, TrialBalance } from "@jewellery/types";
import { apiFetch } from "../auth/api-client";
import { useApiMutation } from "./queries";

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]);
  return p.size ? `?${p}` : "";
};

/** The ERP computes none of this — every figure, balance and ageing bucket is the API's. */
export const accountingApi = {
  accounts: (o: { isActive?: boolean } = {}) => apiFetch<{ items: ChartOfAccount[] }>(`/api/accounting/accounts${qs({ isActive: o.isActive === undefined ? undefined : String(o.isActive) })}`).then((r) => r.items),
  createAccount: (body: object) => apiFetch<{ account: ChartOfAccount }>("/api/accounting/accounts", json("POST", body)).then((r) => r.account),
  updateAccount: (id: string, body: object) => apiFetch<{ account: ChartOfAccount }>(`/api/accounting/accounts/${id}`, json("PATCH", body)).then((r) => r.account),

  journal: (o: { accountId?: string; referenceType?: string; from?: string; to?: string } = {}) => apiFetch<{ items: AccountingEntry[] }>(`/api/accounting/journal${qs(o)}`).then((r) => r.items),
  trialBalance: (asOf?: string) => apiFetch<TrialBalance>(`/api/accounting/trial-balance${qs({ asOf })}`),

  receivablesDashboard: () => apiFetch<ReceivablesSummary>("/api/accounting/receivables/dashboard"),
  outstanding: (customerId?: string) => apiFetch<{ items: OutstandingInvoiceRow[] }>(`/api/accounting/receivables/outstanding${qs({ customerId })}`).then((r) => r.items),
  ageing: () => apiFetch<AgeingReport>("/api/accounting/receivables/ageing"),

  creditNotes: (o: { customerId?: string; status?: string } = {}) => apiFetch<{ items: CreditNote[] }>(`/api/accounting/credit-notes${qs(o)}`).then((r) => r.items),
  createCreditNote: (body: object) => apiFetch<{ creditNote: CreditNote }>("/api/accounting/credit-notes", json("POST", body)).then((r) => r.creditNote),
  cancelCreditNote: (id: string, reason: string) => apiFetch<{ creditNote: CreditNote }>(`/api/accounting/credit-notes/${id}/cancel`, json("POST", { reason })).then((r) => r.creditNote),

  debitNotes: (o: { supplierId?: string; status?: string } = {}) => apiFetch<{ items: DebitNote[] }>(`/api/accounting/debit-notes${qs(o)}`).then((r) => r.items),
  createDebitNote: (body: object) => apiFetch<{ debitNote: DebitNote }>("/api/accounting/debit-notes", json("POST", body)).then((r) => r.debitNote),
  cancelDebitNote: (id: string, reason: string) => apiFetch<{ debitNote: DebitNote }>(`/api/accounting/debit-notes/${id}/cancel`, json("POST", { reason })).then((r) => r.debitNote),
};

const ALL = [["accounting"]] as const;
export const useChartOfAccounts = (o: { isActive?: boolean } = {}) => useQuery({ queryKey: ["accounting", "accounts", o], queryFn: () => accountingApi.accounts(o) });
export const useJournal = (o: { accountId?: string; referenceType?: string; from?: string; to?: string } = {}) => useQuery({ queryKey: ["accounting", "journal", o], queryFn: () => accountingApi.journal(o) });
export const useTrialBalance = (asOf?: string) => useQuery({ queryKey: ["accounting", "trial-balance", asOf], queryFn: () => accountingApi.trialBalance(asOf) });
export const useReceivablesDashboard = () => useQuery({ queryKey: ["accounting", "receivables", "dashboard"], queryFn: accountingApi.receivablesDashboard });
export const useOutstanding = (customerId?: string) => useQuery({ queryKey: ["accounting", "receivables", "outstanding", customerId], queryFn: () => accountingApi.outstanding(customerId) });
export const useAgeing = () => useQuery({ queryKey: ["accounting", "receivables", "ageing"], queryFn: accountingApi.ageing });
export const useCreditNotes = (o: { customerId?: string; status?: string } = {}) => useQuery({ queryKey: ["accounting", "credit-notes", o], queryFn: () => accountingApi.creditNotes(o) });
export const useDebitNotes = (o: { supplierId?: string; status?: string } = {}) => useQuery({ queryKey: ["accounting", "debit-notes", o], queryFn: () => accountingApi.debitNotes(o) });

export const useAccountingAction = <V, R>(fn: (v: V) => Promise<R>, success: string, onSuccess?: (r: R) => void) => useApiMutation(fn, ALL as unknown as readonly (readonly string[])[], { success, ...(onSuccess ? { onSuccess } : {}) });
