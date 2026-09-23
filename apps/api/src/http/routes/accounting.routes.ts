import { Router, type Request, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import { cancelNoteSchema, createChartOfAccountSchema, createCreditNoteSchema, createDebitNoteSchema, updateChartOfAccountSchema } from "@jewellery/validation";
import * as coa from "../../modules/accounting/chart-of-accounts.service";
import * as creditNotes from "../../modules/accounting/credit-note.service";
import * as debitNotes from "../../modules/accounting/debit-note.service";
import { listJournal } from "../../modules/accounting/posting.service";
import { ageingReport, outstandingInvoices, receivablesSummary } from "../../modules/accounting/receivables-reads.service";
import { trialBalance } from "../../modules/accounting/reports.service";
import type { Actor } from "../../modules/accounting/accounting-store";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/authorize";
import { validateBody } from "../middleware/validate";
import "../context";

const P = PERMISSIONS;

/**
 * The first accounting layer's own API: the chart of accounts, the general ledger (read-only —
 * every entry is posted by a commercial document, never typed in here), credit/debit notes, and
 * the receivables dashboard/outstanding/ageing. Every figure is computed server-side
 * (`receivables-reads.service.ts`, `reports.service.ts`) — the ERP screens render what this
 * returns and compute nothing themselves.
 */
export function createAccountingRouter(deps: { authenticate: RequestHandler }) {
  const router = Router();
  router.use(deps.authenticate, (_req, res, next) => (res.set("Cache-Control", "no-store"), next()));
  const view = requirePermission(P.ACCOUNTING_VIEW);
  const manage = requirePermission(P.ACCOUNTING_MANAGE);
  const actor = (req: Express.Request): Actor => ({ id: req.auth!.userId, name: req.auth!.name, ...(req.auth!.email ? { email: req.auth!.email } : {}) });
  const param = (req: Request) => String(req.params.id);

  // chart of accounts
  router.get("/accounts", view, asyncHandler(async (req, res) => void res.json({ items: await coa.listChartOfAccounts({ ...(typeof req.query.isActive === "string" ? { isActive: req.query.isActive === "true" } : {}) }) })));
  router.post("/accounts", manage, validateBody(createChartOfAccountSchema), asyncHandler(async (req, res) => void res.status(201).json({ account: await coa.createChartOfAccount(req.body) })));
  router.patch("/accounts/:id", manage, validateBody(updateChartOfAccountSchema), asyncHandler(async (req, res) => void res.json({ account: await coa.updateChartOfAccount(param(req), req.body) })));

  // general ledger — read-only; nothing here writes a journal entry directly
  router.get(
    "/journal",
    view,
    asyncHandler(async (req, res) =>
      void res.json({
        items: await listJournal({
          ...(typeof req.query.accountId === "string" ? { accountId: req.query.accountId } : {}),
          ...(typeof req.query.referenceType === "string" ? { referenceType: req.query.referenceType } : {}),
          ...(typeof req.query.referenceId === "string" ? { referenceId: req.query.referenceId } : {}),
          ...(typeof req.query.from === "string" ? { from: req.query.from } : {}),
          ...(typeof req.query.to === "string" ? { to: req.query.to } : {}),
        }),
      })
    )
  );
  router.get("/trial-balance", view, asyncHandler(async (req, res) => void res.json(await trialBalance(typeof req.query.asOf === "string" ? req.query.asOf : undefined))));

  // receivables
  router.get("/receivables/dashboard", view, asyncHandler(async (_req, res) => void res.json(await receivablesSummary())));
  router.get("/receivables/outstanding", view, asyncHandler(async (req, res) => void res.json({ items: await outstandingInvoices({ ...(typeof req.query.customerId === "string" ? { customerId: req.query.customerId } : {}) }) })));
  router.get("/receivables/ageing", view, asyncHandler(async (_req, res) => void res.json(await ageingReport())));

  // credit notes
  router.get(
    "/credit-notes",
    view,
    asyncHandler(async (req, res) =>
      void res.json({ items: await creditNotes.listCreditNotes({ ...(typeof req.query.customerId === "string" ? { customerId: req.query.customerId } : {}), ...(typeof req.query.status === "string" ? { status: req.query.status } : {}) }) })
    )
  );
  router.get("/credit-notes/:id", view, asyncHandler(async (req, res) => void res.json({ creditNote: await creditNotes.getCreditNote(param(req)) })));
  router.post("/credit-notes", manage, validateBody(createCreditNoteSchema), asyncHandler(async (req, res) => void res.status(201).json({ creditNote: await creditNotes.createCreditNote(actor(req), req.body) })));
  router.post("/credit-notes/:id/cancel", manage, validateBody(cancelNoteSchema), asyncHandler(async (req, res) => void res.json({ creditNote: await creditNotes.cancelCreditNote(param(req), actor(req), req.body.reason) })));

  // debit notes
  router.get(
    "/debit-notes",
    view,
    asyncHandler(async (req, res) =>
      void res.json({ items: await debitNotes.listDebitNotes({ ...(typeof req.query.supplierId === "string" ? { supplierId: req.query.supplierId } : {}), ...(typeof req.query.status === "string" ? { status: req.query.status } : {}) }) })
    )
  );
  router.get("/debit-notes/:id", view, asyncHandler(async (req, res) => void res.json({ debitNote: await debitNotes.getDebitNote(param(req)) })));
  router.post("/debit-notes", manage, validateBody(createDebitNoteSchema), asyncHandler(async (req, res) => void res.status(201).json({ debitNote: await debitNotes.createDebitNote(actor(req), req.body) })));
  router.post("/debit-notes/:id/cancel", manage, validateBody(cancelNoteSchema), asyncHandler(async (req, res) => void res.json({ debitNote: await debitNotes.cancelDebitNote(param(req), actor(req), req.body.reason) })));

  return router;
}
