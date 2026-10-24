import { describe, expect, it } from "vitest";
import { normalizeDomain, normalizeName, resolveFields } from "./policy";
import type { Assertion, Override } from "./types";

const a = (
  id: string,
  value: Assertion["value"],
  extra: Partial<Assertion> = {},
): Assertion => ({
  id,
  value,
  firmId: "firm",
  companyId: "co",
  field: "sector",
  sourceUrl: "https://example.com",
  sourceTitle: "Source",
  observedAt: "2025-01-01T00:00:00Z",
  claimKind: "reported",
  reviewStatus: "unreviewed",
  superseded: false,
  createdBy: "user",
  createdAt: "2025-01-01T00:00:00Z",
  ...extra,
});
describe("company profile policy", () => {
  it("normalizes identity without silently accepting paths", () => {
    expect(normalizeName("  Acme   Research ")).toBe("Acme Research");
    expect(normalizeDomain("HTTPS://www.Example.com/")).toBe("example.com");
    expect(() => normalizeDomain("https://example.com/company")).toThrow();
    expect(() => normalizeDomain("https://user:secret@example.com")).toThrow();
    expect(() => normalizeDomain(`${"a".repeat(64)}.example.com`)).toThrow();
  });
  it("resolves deterministically by verification, observation, and stable id", () => {
    const assertions = [
      a("z", ["new"], { observedAt: "2026-01-01T00:00:00Z" }),
      a("b", ["b"], { reviewStatus: "verified" }),
      a("a", ["a"], { reviewStatus: "verified" }),
    ];
    expect(resolveFields(assertions, []).sector).toMatchObject({
      value: ["a"],
      assertionId: "a",
      conflict: true,
    });
    expect(resolveFields(assertions.reverse(), []).sector.assertionId).toBe(
      "a",
    );
  });
  it("treats arrays as sets and excludes superseded, rejected, disputed evidence", () => {
    const assertions = [
      a("a", ["B", "A", "A"]),
      a("b", ["A", "B"]),
      a("c", ["C"], { superseded: true }),
      a("d", ["D"], { reviewStatus: "disputed" }),
      a("e", ["E"], { reviewStatus: "rejected" }),
    ];
    expect(resolveFields(assertions, []).sector.conflict).toBe(false);
    expect(resolveFields([], []).foundingYear.value).toBeNull();
  });
  it("suspends an ineligible override, retaining its identity and falling back", () => {
    const pin: Override = {
      id: "pin",
      firmId: "firm",
      companyId: "co",
      field: "sector",
      assertionId: "a",
      active: true,
      reason: "review",
      createdBy: "user",
      createdAt: "2025-01-01T00:00:00Z",
    };
    const assertions = [
      a("a", ["A"], { reviewStatus: "disputed" }),
      a("b", ["B"]),
    ];
    expect(resolveFields(assertions, [pin]).sector).toMatchObject({
      assertionId: "b",
      overrideId: "pin",
      overrideSuspended: true,
    });
    assertions[0].reviewStatus = "verified";
    expect(resolveFields(assertions, [pin]).sector).toMatchObject({
      assertionId: "a",
      overrideSuspended: false,
    });
    expect(pin.active).toBe(true);
  });
});
