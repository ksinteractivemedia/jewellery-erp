import { describe, expect, it } from "vitest";
import { IllegalTransitionError } from "../../shared/errors";
import { assertLegalTransition, isLegalTransition, LEGAL_TRANSITIONS } from "./status-transitions";

describe("isLegalTransition", () => {
  it("allows AVAILABLE -> RESERVED -> SOLD", () => {
    expect(isLegalTransition("AVAILABLE", "RESERVED")).toBe(true);
    expect(isLegalTransition("RESERVED", "SOLD")).toBe(true);
  });

  it("allows AVAILABLE -> WITH_JOB_WORKER -> AVAILABLE", () => {
    expect(isLegalTransition("AVAILABLE", "WITH_JOB_WORKER")).toBe(true);
    expect(isLegalTransition("WITH_JOB_WORKER", "AVAILABLE")).toBe(true);
  });

  it("never allows SOLD -> AVAILABLE directly — a sale is undone via RETURNED", () => {
    expect(isLegalTransition("SOLD", "AVAILABLE")).toBe(false);
    expect(isLegalTransition("SOLD", "RETURNED")).toBe(true);
    expect(isLegalTransition("RETURNED", "AVAILABLE")).toBe(true);
  });

  it("treats MELTING as terminal", () => {
    expect(LEGAL_TRANSITIONS.MELTING).toEqual([]);
    expect(isLegalTransition("MELTING", "AVAILABLE")).toBe(false);
  });

  it("rejects a same-status no-op transition", () => {
    expect(isLegalTransition("AVAILABLE", "AVAILABLE")).toBe(false);
  });

  it("every status is a key in the transition table (no silently-unhandled status)", () => {
    const statuses: (keyof typeof LEGAL_TRANSITIONS)[] = [
      "AVAILABLE",
      "RESERVED",
      "SOLD",
      "RETURNED",
      "DAMAGED",
      "UNDER_REPAIR",
      "IN_MANUFACTURING",
      "WITH_JOB_WORKER",
      "IN_TRANSIT",
      "HALLMARKING",
      "SCRAP",
      "MELTING",
    ];
    for (const status of statuses) {
      expect(Array.isArray(LEGAL_TRANSITIONS[status])).toBe(true);
    }
  });
});

describe("assertLegalTransition", () => {
  it("does not throw for a legal transition", () => {
    expect(() => assertLegalTransition("AVAILABLE", "RESERVED")).not.toThrow();
  });

  it("throws IllegalTransitionError for an illegal transition", () => {
    expect(() => assertLegalTransition("SOLD", "AVAILABLE")).toThrow(IllegalTransitionError);
  });
});
