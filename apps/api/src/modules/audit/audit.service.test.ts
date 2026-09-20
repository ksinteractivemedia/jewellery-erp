import { describe, expect, it } from "vitest";
import { AuditLogModel } from "./audit-log.model";
import { listAuditLogs, recordAudit, sanitizeAuditMetadata } from "./audit.service";

describe("sanitizeAuditMetadata", () => {
  it("redacts credential-looking keys at any depth, keeps the rest", () => {
    const out = sanitizeAuditMetadata({ reason: "x", password: "p", nested: { accessToken: "t", refresh_token: "r", passwordHash: "h", authorization: "Bearer a", fine: 1 }, list: [{ secret: "s", ok: true }] });
    expect(out).toEqual({ reason: "x", password: "[REDACTED]", nested: { accessToken: "[REDACTED]", refresh_token: "[REDACTED]", passwordHash: "[REDACTED]", authorization: "[REDACTED]", fine: 1 }, list: [{ secret: "[REDACTED]", ok: true }] });
  });

  it("bounds depth", () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 10; i++) deep = { n: deep };
    expect(JSON.stringify(sanitizeAuditMetadata(deep))).toContain("[TRUNCATED]");
  });
});

describe("recordAudit", () => {
  it("persists an entry and is queryable with a cursor", async () => {
    for (let i = 0; i < 3; i++) await recordAudit({ action: "auth.login", outcome: "SUCCESS", actorEmail: `u${i}@example.test` });
    const all = await listAuditLogs({ limit: 10 });
    expect(all.map((e) => e.actorEmail)).toEqual(["u2@example.test", "u1@example.test", "u0@example.test"]);
    const older = await listAuditLogs({ before: all[0].id, limit: 10 });
    expect(older).toHaveLength(2);
  });

  it("truncates oversized metadata rather than failing", async () => {
    await recordAudit({ action: "auth.login", outcome: "SUCCESS", metadata: { blob: "x".repeat(10_000) } });
    expect((await AuditLogModel.findOne())!.metadata).toEqual({ truncated: true });
  });

  it("never throws, even when the write fails", async () => {
    await expect(recordAudit({ action: "auth.login", outcome: "NOT_AN_OUTCOME" as never })).resolves.toBeUndefined();
  });
});
