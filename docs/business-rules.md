# Business Rules

These are the rules the system must enforce regardless of which channel (ERP/B2C/B2B) initiates the action. "Why" is included wherever the rule is non-obvious, so it isn't accidentally relaxed later. Cross-reference: [data-model.md](./data-model.md), [architecture.md](./architecture.md).

## 1. Pricing

1.1. **There is exactly one pricing engine** (`packages/pricing-engine`). ERP manual sale, B2C checkout, and B2B order pricing all call it with different inputs (customer group, pricing rules in effect), never different code.
   - Why: jewellery pricing (metal rate × net weight + making charge + wastage + stone value − discount + tax) is complex and error-prone; a second implementation will drift and produce two different prices for the same item.

1.2. **A product's price is not stored — it is computed on demand** from the current `MetalRate`, the product's weight/purity, and applicable `PricingRule`s. There is no "price" field on `Product` that must be kept in sync.

1.3. **Once a price is used in a commercial document (order line, invoice line), it is captured as an immutable `PriceSnapshot`** and never recalculated from current rates.
   - Why: today's gold rate must never retroactively change yesterday's invoice.

1.4. **B2B customers may have negotiated prices or a customer/group-specific price list**, expressed as `PricingRule`s scoped to a `CustomerGroup` or individual `Customer`, evaluated with higher priority than the general list price.

1.5. **Price overrides (manual discount at time of sale) must be recorded with who approved it and why**, as part of the `PriceSnapshot`/`Transaction`, not as a silent adjustment.

1.6. **Tax (GST/CGST/SGST/IGST) is computed by a configurable `TaxRule`**, resolved from HSN code, buyer state, seller state, and effective date — never hardcoded as a fixed percentage in code.

## 2. Inventory

2.1. **Inventory quantity/status is never mutated directly.** Every change to an `InventoryItem`'s status, location, or weight goes through an `InventoryLedger` entry tied to a `Transaction`. Direct field writes to inventory state outside this path are a bug.
   - Why: without a ledger there is no audit trail for "where did this piece go" and no way to reconcile physical stock against system stock — both are non-negotiable in a jewellery business.

2.2. **Finished jewellery is individually serialized** (one `InventoryItem` per physical piece, carrying its own gross/stone/net/fine weight, HUID, cost). **Raw material and loose stones are tracked as fungible batches** (weight/quantity on a batch-style `InventoryItem`), not one document per gram.

2.3. **An order reserves specific inventory, not a quantity.** Reservation is an atomic, guarded status transition (`AVAILABLE` → `RESERVED`) so two concurrent orders cannot reserve the same one-of-a-kind piece.

2.4. **Reserved inventory is released automatically** if the order is cancelled or its reservation window expires (configurable timeout for unpaid B2C orders).

2.5. **Every inventory status must have a legal set of transitions** (e.g. `AVAILABLE → RESERVED → SOLD`, `AVAILABLE → WITH_JOB_WORKER → AVAILABLE`, never `SOLD → AVAILABLE` without an explicit `RETURN` transaction). Illegal transitions are rejected at the service layer, not just discouraged in the UI.

## 3. Orders (B2C & B2B, shared model)

3.1. **Order is a single model with a `channel` discriminator** (`B2C` / `B2B`), not two parallel implementations, because both eventually generate invoices and shipments against the same inventory.

3.2. **B2C orders normally require online payment before confirmation**; inventory is reserved at order creation and released if payment fails/expires.

3.3. **B2B orders may reference a `PurchaseOrder`** raised by the customer and may be confirmed with **offline/deferred payment**, subject to credit rules (§4).

3.4. **An order cannot be confirmed if any line's inventory reservation fails** (item sold/reserved elsewhere in the interim) — the customer/staff must resolve (swap item, back-order, or remove line) before confirmation proceeds.

## 4. B2B credit & pricing

4.1. **Every B2B `Customer` has a `CreditAccount`**: credit limit, payment terms (e.g. net 30), current outstanding, overdue amount, computed available credit (`limit − outstanding`).

4.2. **An order that would push outstanding beyond the credit limit is blocked pending approval**, not silently allowed. Approval workflow and threshold are configurable per customer/customer group, not hardcoded.

4.3. **Outstanding balance is derived from invoices minus allocated payments**, not manually tracked as a single mutable number — payment allocation against specific invoices must be explicit (supports partial payments across multiple invoices).

4.4. **Overdue is computed from invoice due date vs. today**, using the customer's payment terms; it is a read-time calculation, not a stored flag that can go stale.

## 5. Manufacturing & job work

5.1. **A production order issues raw material via a `Transaction`/ledger entry** (status `AVAILABLE → IN_MANUFACTURING`) and receives finished goods back via another (`IN_MANUFACTURING → AVAILABLE`, creating new `InventoryItem`(s) for the finished pieces with their own weights/HUID).

5.2. **Wastage and process loss are recorded explicitly as ledger entries**, not inferred by subtracting issued from received after the fact — the reconciliation is a check, not the source of the number.

5.3. **Job work must reconcile**: `issued material = returned material + finished jewellery weight + recorded wastage + recorded loss/discrepancy`. Any residual discrepancy beyond a configurable tolerance must be flagged for manual review before the job work order can be closed.
   - Why: this is the single most common source of disputes with third-party job workers; the system must make the reconciliation explicit and auditable rather than a spreadsheet side-calculation.

5.4. **Material issued to a job worker changes inventory status to `WITH_JOB_WORKER`, not `SOLD` or removed** — it remains an asset of the business until received back or written off.

## 6. Compliance

6.1. **HUID and hallmarking status are properties of the physical `InventoryItem`**, not the `Product`, since two pieces of the same design may hallmark at different times. Items above the configurable hallmarking-mandatory threshold cannot be marked `AVAILABLE` for B2C sale without a recorded HUID (configurable — mandatory thresholds change over time and by category).

6.2. **GST/HSN/CGST/SGST/IGST logic lives entirely in configurable `TaxRule` records**, versioned by effective date. Tax code must never hardcode a rate or a CGST/SGST-vs-IGST decision — that decision (intra-state vs. inter-state) is itself data-driven from buyer/seller state.

6.3. **Every financial and inventory-affecting action is attributable**: `Transaction` records the acting `User`, timestamp, and channel. This is the baseline audit trail for compliance and dispute resolution.

## 7. Cross-cutting

7.1. **No business logic in React components.** Pricing, credit checks, inventory transitions, tax computation live in `apps/api` services (and `packages/pricing-engine`/`packages/validation`), never duplicated in `apps/erp`, `apps/b2c-store`, or `apps/b2b-portal`.

7.2. **Historical documents (invoices, past ledger entries, past price snapshots) are never edited in place.** Corrections happen via new offsetting transactions (credit note, adjustment entry), preserving the audit trail.

7.3. **Mock/sample data is never mixed into production service code.** Where mock data is needed during UI development, it must be clearly isolated (e.g. a `*.mock.ts` file or a seed script) and never reachable from a real request path.
