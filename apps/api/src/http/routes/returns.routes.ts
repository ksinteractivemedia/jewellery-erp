import { Router, type Request, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import { approveReturnSchema, cancelReturnSchema, inspectReturnSchema, receiveReturnSchema, rejectReturnSchema, requestReturnSchema, settleReturnSchema } from "@jewellery/validation";
import * as returns from "../../modules/returns/return.service";
import * as reads from "../../modules/returns/returns-reads.service";
import type { Actor } from "../../modules/returns/returns-store";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/authorize";
import { validateBody } from "../middleware/validate";
import "../context";

const P = PERMISSIONS;

/**
 * B2C and B2B returns, staff side: REQUESTED → APPROVED/REJECTED → RECEIVED → INSPECTED → SETTLED,
 * or CANCELLED before the piece is back. A return always identifies the exact InventoryItem an
 * order actually sold (return.service.ts); every physical movement is a real inventory ledger entry.
 */
export function createReturnsRouter(deps: { authenticate: RequestHandler }) {
  const router = Router();
  router.use(deps.authenticate, (_req, res, next) => (res.set("Cache-Control", "no-store"), next()));
  const view = requirePermission(P.RETURNS_VIEW);
  const create = requirePermission(P.RETURNS_CREATE);
  const approvePerm = requirePermission(P.RETURNS_APPROVE);
  const actor = (req: Express.Request): Actor => ({ id: req.auth!.userId, name: req.auth!.name, ...(req.auth!.email ? { email: req.auth!.email } : {}) });
  const param = (req: Request) => String(req.params.id);

  router.get("/dashboard", view, asyncHandler(async (_req, res) => void res.json(await reads.returnsDashboard())));
  router.get(
    "/",
    view,
    asyncHandler(async (req, res) =>
      void res.json({
        items: await reads.listReturns({
          ...(typeof req.query.status === "string" ? { status: req.query.status } : {}),
          ...(typeof req.query.channel === "string" ? { channel: req.query.channel } : {}),
          ...(typeof req.query.orderId === "string" ? { orderId: req.query.orderId } : {}),
        }),
      })
    )
  );
  router.get("/:id", view, asyncHandler(async (req, res) => void res.json({ return: await returns.getReturn(param(req)) })));

  router.post(
    "/b2c",
    create,
    validateBody(requestReturnSchema),
    asyncHandler(async (req, res) => void res.status(201).json({ return: await returns.requestReturn(actor(req), "B2C", req.body) }))
  );
  router.post(
    "/b2b",
    create,
    validateBody(requestReturnSchema),
    asyncHandler(async (req, res) => void res.status(201).json({ return: await returns.requestReturn(actor(req), "B2B", req.body) }))
  );
  router.post("/:id/approve", approvePerm, validateBody(approveReturnSchema), asyncHandler(async (req, res) => void res.json({ return: await returns.approveReturn(param(req), actor(req), req.body.note) })));
  router.post("/:id/reject", approvePerm, validateBody(rejectReturnSchema), asyncHandler(async (req, res) => void res.json({ return: await returns.rejectReturn(param(req), actor(req), req.body.reason) })));
  router.post("/:id/receive", create, validateBody(receiveReturnSchema), asyncHandler(async (req, res) => void res.json({ return: await returns.receiveReturn(param(req), actor(req), req.body) })));
  router.post("/:id/inspect", create, validateBody(inspectReturnSchema), asyncHandler(async (req, res) => void res.json({ return: await returns.inspectReturn(param(req), actor(req), req.body) })));
  router.post("/:id/settle", approvePerm, validateBody(settleReturnSchema), asyncHandler(async (req, res) => void res.json({ return: await returns.settleReturn(param(req), actor(req), req.body) })));
  router.post("/:id/cancel", create, validateBody(cancelReturnSchema), asyncHandler(async (req, res) => void res.json({ return: await returns.cancelReturn(param(req), actor(req), req.body.reason) })));

  return router;
}
