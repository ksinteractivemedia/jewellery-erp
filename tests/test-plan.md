# Test Plan

Status: proposed, pre-implementation. Strategy and per-phase plan; concrete test files land alongside the code they cover during each phase in [progress.md](../docs/progress.md).

## 1. Principles

- **The pricing engine and the inventory ledger get the heaviest test investment.** They are money and stock — bugs there are the most expensive kind. Everything else follows normal test discipline; these two get exhaustive treatment.
- **Unit tests for pure logic** (`packages/pricing-engine`, `packages/validation`) — no DB, no HTTP, fast, run on every commit.
- **Integration tests for `apps/api` modules** against a real MongoDB replica set (in-memory or containerized) — because transaction semantics and ledger invariants can't be trusted against a mocked driver.
- **E2E tests for cross-channel flows** (browse → cart → checkout → invoice; B2B PO → order → credit approval → invoice → payment allocation) using Playwright against a running stack.
- **No test suite blocks on infrastructure that isn't set up yet** — each phase's tests run against that phase's actual dependencies, added incrementally rather than a big-bang test harness upfront.

## 2. Pricing engine (packages/pricing-engine)

- Unit tests, table-driven: given a fixed set of (metal rate, purity, weight, making-charge rule, wastage rule, stone value, discount, tax rule) inputs, assert exact output to the paise/rupee.
- Snapshot tests against a set of known-good hand-calculated examples (finance/ops sign-off on the expected numbers before these are locked in as regression baselines).
- Rule-priority/conflict tests: overlapping `PricingRule`s at different scopes (global vs. category vs. customer) resolve in the documented priority order.
- Property-based test: total = metalValue + makingCharge + wastage + stoneValue − discount + tax, always, for randomized valid inputs (catches arithmetic regressions cheaply).
- Explicit regression test: changing today's `MetalRate` must not change a previously-created `PriceSnapshot`'s computed values when re-read.

## 3. Inventory ledger (apps/api inventory module)

- Every `movementType` has a test asserting the correct `fromStatus`→`toStatus` transition and correct ledger entry shape.
- Illegal transition attempts (e.g. `SOLD` → `AVAILABLE` without a `RETURN` transaction) are rejected.
- Concurrency test: two simultaneous reservation attempts on the same unit `InventoryItem` — exactly one succeeds, the other gets a typed "unavailable" error, no double-reservation under load (run with real concurrent requests, not sequential mocked calls).
- Reconciliation test: replaying all `inventoryLedger` entries for an item reproduces its cached `status`/`location` exactly — run as an actual scheduled job in later phases, tested here as a pure function first.
- Batch (fungible) item weight-delta arithmetic: sequential partial issues/receipts never drift the running total (rounding).

## 4. Job work reconciliation (Phase 6)

- Balanced case: issued = returned + finished + wastage + loss exactly → `reconciliationStatus: BALANCED`, order can close.
- Discrepancy case: numbers don't balance within tolerance → `DISCREPANCY_PENDING_REVIEW`, order cannot close without manual override, override is itself audit-logged.
- Partial return over multiple shipments from the job worker accumulates correctly before final reconciliation.

## 5. B2B credit (Phase 4)

- Order within credit limit confirms without approval step.
- Order exceeding available credit is blocked and routed to approval workflow.
- Outstanding/overdue figures recompute correctly as invoices are issued and payments allocated (including partial payment across multiple invoices).

## 6. Compliance (Phase 7)

- Intra-state transaction resolves to CGST+SGST; inter-state resolves to IGST — table-driven across buyer/seller state combinations.
- `TaxRule` effective-dating: a rate change on a given date does not affect invoices dated before it, and does affect ones on/after it.
- HUID enforcement: an item above the configured hallmarking-mandatory threshold cannot transition to B2C-`AVAILABLE` without a recorded HUID.

## 7. API layer (all phases)

- Every module's service functions have integration tests against a test MongoDB instance (replica set, for transaction support).
- Authorization tests per route: each of the three channel identities (ERP staff role, B2B buyer, B2C customer) gets exactly the access the role should have — explicit "should be forbidden" tests, not just "should succeed" tests.
- Input validation: `packages/validation` Zod schemas rejected/accepted cases mirrored between a unit test on the schema and an integration test that the API actually enforces it.

## 8. Frontend (all phases)

- Component tests for `packages/ui` primitives (render, states: default/loading/error/empty, keyboard interaction on Combobox/Command palette/Dialog).
- No business logic to unit test in components by design (business-rules.md §7.1) — frontend tests focus on rendering/interaction correctness, not recomputing prices or credit checks client-side.
- Playwright E2E per phase's critical path (see §9), run against a seeded test database, never against production data.

## 9. E2E critical paths (added as each phase ships)

- Phase 3: guest browses catalogue → adds to cart → checkout → payment succeeds → order confirmed → inventory reserved then sold → invoice generated.
- Phase 3: checkout payment fails/expires → inventory reservation released → item available again.
- Phase 4: B2B buyer submits PO-based order → exceeds credit limit → approval requested → approved → order confirmed → offline payment recorded → invoice partially paid → outstanding reflects remainder.
- Phase 6: job work order issued → partial return → finished goods received → reconciliation balances → order closed.

## 10. What's explicitly out of scope for automated testing (for now)

- Visual regression testing of the design system — deferred until the component library is stable; revisit in Phase 8.
- Load/performance testing beyond the reservation-concurrency test in §3 — a dedicated load test pass is called out as part of Phase 8 (architecture.md risk #2/#3), not before there's a real system to load-test.
