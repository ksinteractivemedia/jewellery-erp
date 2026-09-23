import { describe, expect, it } from "vitest";
import { HALLMARKING_BATCH_STATUSES } from "@jewellery/types";
import { createHallmarkingBatchSchema, receiveHallmarkingBatchSchema } from "@jewellery/validation";
import { HALLMARKING_RULES, HALLMARKING_TRANSITIONS, IllegalHallmarkingTransitionError, checkHallmarkingAction, checkLineOutcome } from "./hallmarking-status";

/** Every (action x status) pair is decided by the rule table: allowed exactly from the listed statuses, refused with a typed 409 from every other. */
describe("hallmarking batch: every action x every status", () => {
  for (const [action, rule] of Object.entries(HALLMARKING_RULES)) {
    for (const status of HALLMARKING_BATCH_STATUSES) {
      const allowed = (rule.from as readonly string[]).includes(status);
      it(`${action} from ${status} is ${allowed ? `allowed -> ${rule.to}` : "refused"}`, () => {
        if (allowed) expect(checkHallmarkingAction(action as never, status)).toBe(rule.to);
        else expect(() => checkHallmarkingAction(action as never, status)).toThrow(IllegalHallmarkingTransitionError);
      });
    }
  }
});

describe("the graph is exactly what the rules imply", () => {
  it("every edge is produced by some action, and RECEIVED/CANCELLED have no exits", () => {
    for (const from of HALLMARKING_BATCH_STATUSES) {
      for (const to of HALLMARKING_BATCH_STATUSES) {
        const viaRule = Object.values(HALLMARKING_RULES).some((r) => (r.from as readonly string[]).includes(from) && r.to === to);
        expect(HALLMARKING_TRANSITIONS[from].includes(to), `${from} -> ${to}`).toBe(viaRule);
      }
    }
    expect(HALLMARKING_TRANSITIONS.RECEIVED).toEqual([]);
    expect(HALLMARKING_TRANSITIONS.CANCELLED).toEqual([]);
  });
});

describe("the workflow's own vocabulary matches the spec exactly", () => {
  it("Send to Hallmarking -> In Transit -> At Hallmarking Centre -> Received (Verified/Failed are per-piece outcomes, not batch statuses)", () => {
    expect([...HALLMARKING_BATCH_STATUSES].sort()).toEqual(["AT_CENTRE", "CANCELLED", "IN_TRANSIT", "PENDING", "RECEIVED"].sort());
  });
});

describe("checkLineOutcome: a piece can only be decided once, and only once the batch is back", () => {
  it("refuses before RECEIVED", () => {
    expect(() => checkLineOutcome("PENDING", undefined)).toThrow(/received/i);
    expect(() => checkLineOutcome("IN_TRANSIT", undefined)).toThrow(/received/i);
    expect(() => checkLineOutcome("AT_CENTRE", undefined)).toThrow(/received/i);
  });
  it("allows exactly once RECEIVED, and refuses a second decision", () => {
    expect(() => checkLineOutcome("RECEIVED", undefined)).not.toThrow();
    expect(() => checkLineOutcome("RECEIVED", "VERIFIED")).toThrow(/already/i);
    expect(() => checkLineOutcome("RECEIVED", "FAILED")).toThrow(/already/i);
  });
});

describe("createHallmarkingBatchSchema", () => {
  it("needs at least one item and an assaying centre; refuses an unknown field", () => {
    expect(createHallmarkingBatchSchema.safeParse({ assayingCentreId: "a".repeat(24), itemIds: ["b".repeat(24)] }).success).toBe(true);
    expect(createHallmarkingBatchSchema.safeParse({ assayingCentreId: "a".repeat(24), itemIds: [] }).success).toBe(false);
    expect(createHallmarkingBatchSchema.safeParse({ assayingCentreId: "a".repeat(24), itemIds: ["b".repeat(24)], status: "RECEIVED" } as never).success).toBe(false);
  });
});

describe("receiveHallmarkingBatchSchema", () => {
  it("a HUID, if given, must be exactly 6 letters/digits — the one shared shape (zHuid), never re-implemented here", () => {
    const base = { lines: [{ itemId: "a".repeat(24) }] };
    expect(receiveHallmarkingBatchSchema.safeParse(base).success).toBe(true); // no HUID — came back unmarked
    expect(receiveHallmarkingBatchSchema.safeParse({ lines: [{ itemId: "a".repeat(24), huid: "AB12CD" }] }).success).toBe(true);
    expect(receiveHallmarkingBatchSchema.safeParse({ lines: [{ itemId: "a".repeat(24), huid: "TOOLONG1" }] }).success).toBe(false);
  });
});
