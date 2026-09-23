import { recordAudit, type AuditAction } from "../audit/audit.service";

/** Whoever is acting — always staff, the same as every other financial workflow module here (no external-party login posts directly to the ledger). */
export interface Actor {
  id: string;
  name: string;
  email?: string;
}

export const audit = (actor: Actor, action: AuditAction, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) =>
  recordAudit({ action, outcome: "SUCCESS", actorId: actor.id, ...(actor.email ? { actorEmail: actor.email } : {}), targetType, targetId, metadata });
