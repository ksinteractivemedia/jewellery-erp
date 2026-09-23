"use client";

import * as React from "react";
import { Badge, PageHeader } from "@jewellery/ui";
import { PERMISSIONS as P } from "@jewellery/types";
import type { ChartOfAccount } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { accountingApi, useAccountingAction, useChartOfAccounts } from "../../lib/api/accounting";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, Table, Td, Th, btn, inputCls } from "./shared";

const TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;

function NewAccountForm({ onDone }: { onDone: () => void }) {
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<(typeof TYPES)[number]>("ASSET");
  const [description, setDescription] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const create = useAccountingAction(accountingApi.createAccount, "Account created", onDone);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" data-testid="new-account-form">
      <h3 className="text-h4 font-semibold">New account</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Code"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} data-testid="account-code" /></Field>
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} data-testid="account-name" /></Field>
        <Field label="Type">
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])} data-testid="account-type">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Description"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} data-testid="account-description" /></Field>
      </div>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="account-form-error">{err}</p>}
      <div className="flex gap-2">
        <button
          className={btn("primary")}
          disabled={!code.trim() || !name.trim() || create.isPending}
          onClick={() => create.mutate({ code: code.trim(), name: name.trim(), type, ...(description.trim() ? { description: description.trim() } : {}) } as never, { onError: (e) => setErr(errorMessage(e)) })}
          data-testid="account-save"
        >
          Create
        </button>
      </div>
    </div>
  );
}

function Row({ account, onDone }: { account: ChartOfAccount; onDone: () => void }) {
  const { can } = useAuth();
  const [err, setErr] = React.useState<string>();
  const toggle = useAccountingAction((isActive: boolean) => accountingApi.updateAccount(account.id, { isActive }), "Account updated", onDone);
  return (
    <tr data-testid="account-row">
      <Td className="tabular font-medium">{account.code}</Td>
      <Td>{account.name}{account.systemRole && <Badge variant="info" className="ml-2">{account.systemRole.replace(/_/g, " ")}</Badge>}</Td>
      <Td className="text-muted">{account.type}</Td>
      <Td className="text-muted">{account.description}</Td>
      <Td>{account.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="neutral">Inactive</Badge>}</Td>
      <Td>
        {can(P.ACCOUNTING_MANAGE) && (
          <button className={btn()} disabled={toggle.isPending} onClick={() => toggle.mutate(!account.isActive, { onError: (e) => setErr(errorMessage(e)) })} data-testid="account-toggle">
            {account.isActive ? "Deactivate" : "Activate"}
          </button>
        )}
        {err && <span className="ml-2 text-caption text-danger" role="alert">{err}</span>}
      </Td>
    </tr>
  );
}

export function ChartOfAccountsView() {
  const [creating, setCreating] = React.useState(false);
  const q = useChartOfAccounts();
  const { can } = useAuth();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Chart of Accounts"
        description="The accounts the posting engine writes to. A system account's role can't be reassigned by editing it — only by giving the role to another active account first."
        actions={can(P.ACCOUNTING_MANAGE) ? <button className={btn("primary")} onClick={() => setCreating((v) => !v)} data-testid="account-new">{creating ? "Close" : "New account"}</button> : undefined}
      />
      {creating && <NewAccountForm onDone={() => { setCreating(false); q.refetch(); }} />}
      <Load q={q}>
        <Table testId="accounts-table"><thead><tr><Th>Code</Th><Th>Name</Th><Th>Type</Th><Th>Description</Th><Th>Status</Th><Th></Th></tr></thead><tbody>
          {(q.data ?? []).map((a) => <Row key={a.id} account={a} onDone={() => q.refetch()} />)}
        </tbody></Table>
      </Load>
    </div>
  );
}
