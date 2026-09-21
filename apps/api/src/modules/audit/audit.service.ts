import type { AuditLogEntry, AuditOutcome } from "@jewellery/types";
import { deepStringifyObjectIds, toDTOList } from "../../shared/to-dto";
import { AuditLogModel } from "./audit-log.model";

/** Every audited action, in one place — a typo can't silently create a new, unqueryable action name. */
export const AUDIT_ACTIONS = {
  LOGIN: "auth.login",
  LOGOUT: "auth.logout",
  LOGOUT_ALL: "auth.logout_all",
  TOKEN_REFRESH_REJECTED: "auth.token_refresh_rejected",
  SESSION_REUSE_DETECTED: "auth.session_reuse_detected",
  PASSWORD_CHANGED: "auth.password_changed",
  PASSWORD_RESET_REQUESTED: "auth.password_reset_requested",
  PASSWORD_RESET_COMPLETED: "auth.password_reset_completed",
  PASSWORD_RESET_REJECTED: "auth.password_reset_rejected",
  ACCESS_DENIED: "authz.denied",
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_ROLES_CHANGED: "user.roles_changed",
  USER_DEACTIVATED: "user.deactivated",
  USER_SESSIONS_REVOKED: "user.sessions_revoked",
  ROLE_CREATED: "role.created",
  ROLE_PERMISSIONS_CHANGED: "role.permissions_changed",
  PRODUCT_CREATED: "catalog.product_created",
  PRODUCT_UPDATED: "catalog.product_updated",
  PRODUCT_DELETED: "catalog.product_deleted",
  PRODUCT_BULK_UPDATED: "catalog.product_bulk_updated",
  VARIANT_CREATED: "catalog.variant_created",
  VARIANT_UPDATED: "catalog.variant_updated",
  VARIANT_DELETED: "catalog.variant_deleted",
  CATEGORY_CREATED: "catalog.category_created",
  CATEGORY_UPDATED: "catalog.category_updated",
  CATEGORY_DELETED: "catalog.category_deleted",
  COLLECTION_CREATED: "catalog.collection_created",
  COLLECTION_UPDATED: "catalog.collection_updated",
  COLLECTION_DELETED: "catalog.collection_deleted",
  MEDIA_UPLOADED: "catalog.media_uploaded",
  INVENTORY_ITEM_RECEIVED: "inventory.item_received",
  INVENTORY_IDENTIFIERS_UPDATED: "inventory.identifiers_updated",
  INVENTORY_RESERVED: "inventory.reserved",
  INVENTORY_RELEASED: "inventory.released",
  INVENTORY_MOVED: "inventory.moved",
  INVENTORY_RETURN_INSPECTED: "inventory.return_inspected",
  INVENTORY_TRANSFER_DISPATCHED: "inventory.transfer_dispatched",
  INVENTORY_TRANSFER_RECEIVED: "inventory.transfer_received",
  INVENTORY_TRANSFER_CANCELLED: "inventory.transfer_cancelled",
  INVENTORY_ADJUSTMENT_REQUESTED: "inventory.adjustment_requested",
  INVENTORY_ADJUSTMENT_APPROVED: "inventory.adjustment_approved",
  INVENTORY_ADJUSTMENT_REJECTED: "inventory.adjustment_rejected",
  B2B_PROFILE_UPDATED: "b2b.profile_updated",
  B2B_PO_REVIEW_STARTED: "b2b.po_review_started",
  B2B_PO_APPROVED: "b2b.po_approved",
  B2B_PO_REJECTED: "b2b.po_rejected",
  B2B_QUOTATION_ISSUED: "b2b.quotation_issued",
  B2B_CREDIT_OVERRIDDEN: "b2b.credit_overridden",
  B2B_ORDER_CANCELLED: "b2b.order_cancelled",
  B2B_ORDER_ALLOCATED: "b2b.order_allocated",
  B2B_INVOICE_ISSUED: "b2b.invoice_issued",
  B2B_PAYMENT_RECORDED: "b2b.payment_recorded",
  B2B_PAYMENT_VERIFIED: "b2b.payment_verified",
  B2B_PAYMENT_REJECTED: "b2b.payment_rejected",
  B2B_PAYMENT_REVERSED: "b2b.payment_reversed",
  B2B_PAYMENT_ALLOCATED: "b2b.payment_allocated",
  AUDIT_LOG_VIEWED: "audit.viewed",
} as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditInput {
  action: AuditAction;
  outcome: AuditOutcome;
  actorId?: string;
  actorEmail?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

const SENSITIVE_KEY = /pass(word)?|token|secret|hash|authorization|cookie|otp/i;
const MAX_METADATA_CHARS = 4000;

/**
 * Audit metadata is caller-supplied, so it is scrubbed here rather than trusting every call
 * site: any key that looks like a credential is replaced, and oversized payloads are cut.
 */
export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth > 4) return "[TRUNCATED]";
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => sanitizeAuditMetadata(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeAuditMetadata(nested, depth + 1);
  }
  return out;
}

function boundedMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return undefined;
  const clean = sanitizeAuditMetadata(metadata) as Record<string, unknown>;
  return JSON.stringify(clean).length > MAX_METADATA_CHARS ? { truncated: true } : clean;
}

/**
 * Records a security event. Deliberately never throws: a failing audit write must not turn a
 * successful sign-in or user update into a 500 (and must not become an availability lever
 * for an attacker). The failure is logged loudly instead — see docs/architecture.md §7 for
 * the fail-open vs fail-closed trade-off and when to revisit it.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await AuditLogModel.create({ ...input, metadata: boundedMetadata(input.metadata) });
  } catch (error) {
    console.error("[audit] failed to write audit log entry", input.action, error);
  }
}

export interface AuditQuery {
  action?: string;
  actorId?: string;
  outcome?: AuditOutcome;
  targetType?: string;
  targetId?: string;
  /** Cursor: only entries older than this id (ids are time-ordered). */
  before?: string;
  limit?: number;
}

export async function listAuditLogs(query: AuditQuery = {}): Promise<AuditLogEntry[]> {
  const filter: Record<string, unknown> = {};
  for (const key of ["action", "actorId", "outcome", "targetType", "targetId"] as const) {
    if (query[key]) filter[key] = query[key];
  }
  if (query.before) filter._id = { $lt: query.before };
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const docs = await AuditLogModel.find(filter).sort({ _id: -1 }).limit(limit);
  return toDTOList<AuditLogEntry>(docs).map((d) => deepStringifyObjectIds(d));
}
