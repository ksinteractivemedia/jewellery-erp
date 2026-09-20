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

## 11. Authentication & authorization (implemented — `apps/api`, 129 tests + 27 browser checks)

Run: `pnpm --filter @jewellery/api test` (Vitest, in-memory MongoDB replica set; bcrypt cost 4 in tests only).

- **Policy integrity (`role-matrix.test.ts`)** — all 13 roles defined; every granted permission exists; `SUPER_ADMIN` = everything; `ADMIN` = everything minus `settings.manage_roles`; only `SUPER_ADMIN` can manage roles; `settings.*` only for the two admin roles; `VIEWER` strictly `*.view`; separation of duties for `inventory.approve_adjustment`, `b2b.override_credit`, `accounting.create_payment`, `sales.override_price`.
- **Tokens (`tokens.test.ts`)** — round-trip; identity-only claims; `TOKEN_EXPIRED` vs `UNAUTHENTICATED`; wrong secret/audience/issuer; tampered payload; `alg: none`; missing `sid`; opaque-token entropy/parsing/constant-time compare.
- **Authentication service (`auth.service.test.ts`)** — login success; identical failure for unknown user / wrong password / inactive / locked; lockout and recovery; audit reasons without the password; refresh rotation, **reuse detection revoking the session**, concurrent-refresh race (exactly one wins), idle and absolute expiry, deactivated user; per-request revocation on logout / deactivation / role change / inactive role; logout idempotence and logout-all isolation; change-password; full password-reset matrix (unknown email sends nothing, hashed storage, single-use, expired, superseded link, forged secret doesn't burn the real token, inactive account, policy).
- **HTTP (`auth.routes.test.ts`)** — cookie flags (HttpOnly, SameSite=Strict, Path, Secure), refresh token never in body/header/query, CSRF origin check, cookie rotation and clearing, rate limiting (login, forgot-password), NoSQL-injection-shaped bodies → 400, security headers, CORS allow-list.
- **Authorization (`authorization.test.ts`)** — every protected endpoint → 401 with no/expired/tampered/revoked token; **13 roles × every endpoint** allowed exactly where the matrix says and 403 elsewhere; no-role user; client-claimed role headers ignored; live permission/deactivation changes; no privilege escalation (ADMIN can't mint/modify SUPER_ADMIN, no self role-change/deactivation, PATCH can't smuggle roles/email/hash); custom roles; audit content, secret-free audit dump, audit-log endpoint guarded and itself audited, audit immutability.
- **Browser E2E (Playwright against the real API + ERP, 27 checks)** — deep-link → login → back, generic login error, client validation, open-redirect protection, per-role sidebars, forbidden URL, session restore on reload, no token in web storage, cookie flags, real sign-out, guarded again after logout, forgot/reset pages, and a `VIEWER` calling `/api/users` + `/api/audit-logs` directly with its own token → 403. The script is ad hoc (scratch), not yet a committed suite — promote it to `apps/erp/e2e` when the ERP gets more screens.
- **Gaps** — no test yet for concurrent multi-tab refresh in a real browser, load/rate-limit behaviour across multiple API instances (needs the Redis store), or a real email transport.

## 12. Product Master / catalogue (implemented — `apps/api`, 77 tests + 63 browser checks)

Run: `pnpm --filter @jewellery/api test` (schema/unit tests need no DB; the HTTP suite uses the in-memory replica set).

- **Schemas (`catalog.validation.test.ts`)** — `slugify` (diacritics, `&`, truncation), SKU uppercasing/defaults (channels off, active), tag normalisation/de-dupe/limits, https-only videos, image-key shape (no URLs/traversal/foreign extensions), net ≤ gross, SKU stripped from updates, `null`-clears vs. no default leakage into partial updates, list-query coercion and rejection (page size cap, unknown sort, non-boolean flags), bulk union + 200-id cap.
- **Media (`image-validation.test.ts`)** — PNG/JPEG/WebP by bytes; SVG, HTML, GIF, a WAV `RIFF`, empty and truncated files refused; disk storage refuses `..`/absolute/foreign-extension keys.
- **HTTP (`catalog.routes.test.ts`)** — **13 roles × every catalogue endpoint** (reads need `catalog.view`, writes/upload need `catalog.manage`, nothing else decides); stock visible only with `inventory.view` (custom catalogue-only role); create/derive-slug/uppercase SKU; duplicate SKU (case-insensitive, across the variant namespace); dangling metal/category/collection/image and purity-for-metal rejected; SKU immutable, `null` clears, purity re-validated on metal change; search (multi-word AND, variant SKU, regex metacharacters literal), every filter and their AND-combination, case-insensitive sort, paging/out-of-range, bad params → 400; bulk (idempotent `modified`, set/clear category, add/remove collection, empty/oversized/unknown/dangling); variants (CRUD, product-scoping, SKU namespace, delete blocked by inventory); product delete (guard by inventory; product edits never create/alter `InventoryItem`s); categories (tree/counts, cycles, delete guards); collections (detach-on-delete); upload/serving (content-sniffed type, renamed HTML/SVG refused, hostile filenames ignored, 413, 403 for read-only, traversal → 404, public read with nosniff/CORP/immutable); audit content and denied writes.
- **Seed (`seed/catalog.seed.test.ts`)** — generated PNGs are accepted by the validator; every seeded product has a purity valid for its metal, existing category/collections, uploaded images and net ≤ gross.
- **Browser (Playwright, scratch script)** — list/search/filter/sort/paging state in the URL and surviving reload; variant-SKU search; thumbnails loading cross-origin; bulk selection → confirm → result, selection cleared on filter change; create with validation, image upload (and a fake `.png` rejected server-side), duplicate-SKU inline error; detail, variants, edit (SKU locked), deactivate, delete; category tree/sub-category/refused delete/parent picker; collections CRUD and filtered-list link; **read-only role**: no create/bulk controls, forbidden on `/new`, 403 calling the bulk API directly; **390 px**: cards instead of table, filter drawer, no horizontal overflow on list/detail/form.
- **Gaps** — no S3 adapter test (adapter not written), no concurrent-edit conflict test (last write wins), no load test of the list against a large catalogue, no automated visual regression.

## 13. Jewellery inventory (implemented — `apps/api`, 172 tests + 100 browser checks)

Run: `pnpm --filter @jewellery/api test`. The domain suites use the in-memory MongoDB **replica set** with real transactions and real parallel operations — no mocked driver — because the guarantees under test (atomic multi-document commit, write-conflict retry) only exist there.

- **Pure logic** — `movement-rules.test.ts` (every movement type has a rule; **no rule permits a status change the physical graph forbids**; each outbound movement has exactly one way back; destination-kind bindings; only receipts/adjustments create stock; owned-stock and available-for-sale definitions), `valuation.test.ts` (metal value maths, own-purity vs derived rate, no-rate note), `reconciliation.test.ts` (`replayLedger`: order-independence, sequence gaps, status-chain breaks, balance ≠ previous + delta, legitimate re-weigh), `inventory.validation.test.ts` (invalid weights: zero/negative/NaN/∞/4 decimals/absurd/stone ≥ gross; HUID length/charset/case/implied hallmark; barcode alphabet; posting contract — duplicate items, >100, removed movement names, zero deltas; request schemas; list/summary queries; scan-code parsing incl. scanner CR/LF/Tab, hostile input, label round-trip).
- **Operations (`stock-operations.test.ts`, 75)**
  - *Receiving:* ledger entry #1, allocated codes distinct under concurrency; **duplicate HUID** (typed error naming it, no orphan rows, case-insensitive, three racing creates → one), duplicate code/barcode, HUID set-once/immutable via identifiers; **invalid weights** (each refused with nothing written); wrong purity; unit quantity > 1; partner/unknown location.
  - *Reservation / release / sale / return:* hold recorded with its order; second reservation refused; all-or-nothing across pieces; release by holder, refused for another order, forced override; sale of a held piece only by its order; **no double sale**; nothing sellable in transit/hallmarking/job work/repair; **return** (SOLD→RETURNED into a stock location only), inspection outcomes, full circle; expiry sweep (lapsed released as System, live/open-ended kept, concurrently-sold skipped, idempotent).
  - *Transfers:* dispatch → IN_TRANSIT at the destination with `TRANSFER_OUT`; receive; partial receive; cancel; cancel after partial; closed transfers can't be re-closed; **all-or-nothing** (one ineligible piece stops everything, nothing written); source/destination validation; in-transit pieces can't be reserved/sold/re-transferred; damaged-in-transit can't be received as fine.
  - *Partner movements:* hallmarking with HUID (pending → hallmarked), HUID clash rolls the whole movement back, HUID immutability, destination-kind binding for each movement, way-back lands in stock, full trips for job work/repair/manufacturing, movements refused from statuses that don't own them.
  - *Adjustments:* a request changes nothing (no ledger row); different-person approval posts the entry with the approver as actor; **self-approval refused**; re-weigh recomputes net/fine with deltas and balance; impossible requests refused at request time; **stale** request refused at approval; reject; five simultaneous approvals apply once; SCRAP/MELTING movement types and no way back from melting.
  - ***Negative stock*:** over-withdrawal of quantity or weight refused with nothing written, draw-down to exactly zero allowed then refused, all-or-nothing across lines, units refuse deltas, batches refuse reservation.
  - ***Concurrent operations* (real parallel transactions):** 8 simultaneous reservations → exactly one; sale vs reservation racing (3 rounds); two transfers of one piece to different places → one dispatch, one transfer record; receive vs receive vs cancel → once; **12 withdrawals of 10 from a 100-unit batch → exactly 10 succeed, never negative, sequences 1..11 gap-free**; 20 unrelated pieces reserved in parallel all succeed (no over-serialisation); interleaved reserve/release/sell/transfer storms leave every ledger and cache in agreement.
  - *History & integrity:* a piece's whole life reads off its ledger in order, gap-free and status-chained, with location at each step; every entry carries who/why/reference; ledger and transactions immutable; a direct edit of the cached item is **detected** by reconciliation; a duplicate `(itemId, sequence)` is impossible.
- **HTTP (`inventory.routes.test.ts`, 47)** — unauthenticated → 401 on every endpoint; **all 13 roles × all 22 endpoints** allowed exactly where the permission matrix says; sale/return not reachable over HTTP; client-claimed roles ignored; list (rich rows, search across code/barcode/HUID/SKU/name/variant with regex-safe literal matching, every filter and their AND-combination, sort, filtered totals vs page, bad params → 400); detail (product/location, valuation from the current rate, derived-purity note, no-rate note, future-dated rate ignored, 404/400, no Mongo internals); summaries by location/SKU/purity/metal (counts, weights, cost, status mix, in-transit counted at destination but not available, scope, filters); ledger (filters, enrichment, paging, System attribution, bad params); per-item audit (actor, request id, no secrets); scan (QR/code/barcode/serial/HUID, unknown → 200 with no item, hostile input); receive (201, validation with named fields, duplicate HUID 409, unknown refs, smuggled fields ignored, HUID set-once); reserve/release (ownership: only the holder or an approver; forced release needs authority; malformed bodies); transfers and partner movements end to end; return inspection; adjustments over HTTP (four-eyes, role split, stale, impossible requests, reject).
- **Seed (`seed/inventory.seed.test.ts`)** — every seeded piece reconciles with its ledger; every status, transfer state and adjustment state the screens display exists.
- **Browser (Playwright, scratch script, 100 checks)** — list shape and 25/66 paging; **sticky toolbar stays pinned while scrolling**; search by HUID/barcode/name; every filter and URL persistence; sort/paging; the four summary tabs and drill-down; **scan box, QR payload, scanner-speed keyboard burst (opens the piece) vs slow typing (does not)**; quick view; bulk actions by status (transfer → in transit → receive; hallmarking out/back with HUID; reserve/release; mixed selection offers nothing); detail sections, valuation text, QR renders, timeline and audit tab; receive form (validation, net preview, duplicate HUID from the server, success); adjustments (request → queue → approve → ledger; store manager sees no approve controls; **self-approve disabled**; stale flagged; reject); ledger filters/empty state; **viewer: read-only UI and 403 on every stock-changing API called directly**; **390 px**: cards, filter drawer, no horizontal overflow on list/detail/ledger/transfers/adjustments/receive.
- **Gaps** — no test of `releaseExpiredReservations` on a schedule (it is not scheduled); no load test at catalogue scale; no test for partial-lot batch issue (not implemented); no automated visual regression; the E2E suite is not committed.

