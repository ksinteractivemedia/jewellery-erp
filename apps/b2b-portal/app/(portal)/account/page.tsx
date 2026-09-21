"use client";

import { money0 } from "../../../lib/money";
import { useAccount } from "../../../lib/queries";
import { CreditPanel, Failure, Loading, PageHead } from "../../../components/ui";

const Row = ({ k, v }: { k: string; v?: React.ReactNode }) => v ? <div className="flex justify-between gap-4 border-b border-border-subtle py-2 text-[0.8125rem] last:border-0"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div> : null;

export default function AccountPage() {
  const q = useAccount();
  if (q.isLoading) return <><PageHead title="Account" /><Loading rows={6} /></>;
  if (q.isError || !q.data) return <Failure error={q.error} retry={() => q.refetch()} />;
  const a = q.data;
  const addr = (x: { line1: string; line2?: string; city: string; state: string; postalCode: string }) => `${x.line1}${x.line2 ? `, ${x.line2}` : ""}, ${x.city}, ${x.state} ${x.postalCode}`;
  return (
    <>
      <PageHead title="Account" sub="Your company profile and trading terms. To change anything here, contact your salesperson." />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="co-h"><h2 id="co-h" className="mb-2 font-semibold">Company</h2><dl data-testid="company"><Row k="Company" v={a.customer.name} /><Row k="GSTIN" v={a.customer.gstin} /><Row k="Email" v={a.customer.email} /><Row k="Phone" v={a.customer.phone} /><Row k="Customer group" v={a.groupName} /><Row k="Territory" v={a.profile.territory} /></dl></section>
        <section className="card p-5" aria-labelledby="terms-h"><h2 id="terms-h" className="mb-2 font-semibold">Trading terms</h2><dl data-testid="terms"><Row k="Credit limit" v={money0(a.profile.creditLimit)} /><Row k="Payment terms" v={`Net ${a.profile.paymentTermsDays} days`} /><Row k="Price list" v={a.priceList?.name ?? "Standard wholesale"} /><Row k="Account status" v={a.profile.creditHold ? <span className="text-danger">On credit hold</span> : "Active"} /></dl></section>
        <section className="card p-5 lg:col-span-2" aria-labelledby="credit-h"><h2 id="credit-h" className="mb-3 font-semibold">Credit</h2><CreditPanel p={a.position} /></section>
        <section className="card p-5" aria-labelledby="addr-h"><h2 id="addr-h" className="mb-2 font-semibold">Addresses</h2>{a.billingAddress && <div className="mb-3 text-[0.8125rem]"><p className="label mb-0.5">Billing</p><p data-testid="billing">{addr(a.billingAddress)}</p></div>}<p className="label mb-0.5 text-[0.8125rem]">Shipping</p><ul className="flex flex-col gap-1.5 text-[0.8125rem]" data-testid="shipping">{a.shippingAddresses.map((s, i) => <li key={i}>{addr(s)}</li>)}</ul></section>
        <section className="card p-5" aria-labelledby="ct-h"><h2 id="ct-h" className="mb-2 font-semibold">Contacts</h2><ul className="flex flex-col gap-3 text-[0.8125rem]" data-testid="contacts">{a.profile.contacts.map((c, i) => <li key={i}><p className="font-medium">{c.name}{c.isPrimary && <span className="chip ml-2 border-border bg-surface-sunken text-muted">Primary</span>}</p><p className="text-muted">{[c.designation, c.email, c.phone].filter(Boolean).join(" · ")}</p></li>)}</ul></section>
        {a.salesperson && <section className="card p-5 lg:col-span-2" aria-labelledby="sp-h"><h2 id="sp-h" className="mb-2 font-semibold">Your salesperson</h2><p className="text-[0.8125rem]" data-testid="salesperson"><span className="font-medium">{a.salesperson.name}</span>{a.salesperson.email && <> · {a.salesperson.email}</>}{a.salesperson.phone && <> · {a.salesperson.phone}</>}</p></section>}
      </div>
    </>
  );
}
