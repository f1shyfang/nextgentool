import { describe, expect, it } from "vitest";
import {
  compareDecimals,
  dateBounds,
  duplicateKey,
  financingFiltersSchema,
  materialChange,
  normalizeDecimal,
  signalPayloadSchema,
} from "./signal-policy";
import type { SignalPayload } from "./signal-types";

const payload: SignalPayload = {
  category: "financing",
  title: "Seed financing",
  summary: "Company announced a seed round",
  eventDate: { precision: "day", value: "2026-02-28" },
  sources: [
    {
      url: "https://example.com/news",
      title: "Announcement",
      publishedOn: null,
      observedAt: "2026-10-20T00:00:00.000Z",
    },
  ],
  status: "unreviewed",
  financing: {
    roundType: "seed",
    amount: "99999999999999999999.9999",
    currency: "USD",
    investors: ["Alpha"],
    valuation: null,
    valuationKind: null,
  },
};
describe("manual signal policies", () => {
  it("preserves exact large decimal strings", () => {
    expect(signalPayloadSchema.parse(payload).financing?.amount).toBe(
      "99999999999999999999.9999",
    );
    expect(normalizeDecimal("000000001.2300")).toBe("1.23");
    expect(
      compareDecimals("99999999999999999999.9998", "99999999999999999999.9999"),
    ).toBe(-1);
    expect(compareDecimals("0001.2000", "1.2")).toBe(0);
    for (const amount of [1, "-1", "1e4", "1.00001", "123456789012345678901"])
      expect(
        signalPayloadSchema.safeParse({
          ...payload,
          financing: { ...payload.financing, amount },
        }).success,
      ).toBe(false);
  });
  it("requires real dates matching precision without manufacturing days", () => {
    for (const eventDate of [
      { precision: "day", value: "2026-02-29" },
      { precision: "month", value: "2026-13" },
      { precision: "year", value: "2026-01-01" },
      { precision: "unknown", value: "2026" },
    ])
      expect(
        signalPayloadSchema.safeParse({ ...payload, eventDate }).success,
      ).toBe(false);
    expect(dateBounds({ precision: "month", value: "2024-02" })).toEqual({
      dateStart: "2024-02-01",
      dateEnd: "2024-02-29",
    });
    expect(dateBounds({ precision: "year", value: "2026" })).toEqual({
      dateStart: "2026-01-01",
      dateEnd: "2026-12-31",
    });
    expect(dateBounds({ precision: "unknown", value: null })).toEqual({
      dateStart: null,
      dateEnd: null,
    });
  });
  it("rejects private/credentialed sources, invalid publication dates and unknown nested keys", () => {
    for (const url of [
      "https://user:pass@example.com",
      "http://127.0.0.1",
      "http://[::1]",
      "http://company.internal",
      "file:///tmp/reference",
    ])
      expect(
        signalPayloadSchema.safeParse({
          ...payload,
          sources: [{ ...payload.sources[0], url }],
        }).success,
      ).toBe(false);
    expect(
      signalPayloadSchema.safeParse({
        ...payload,
        sources: [{ ...payload.sources[0], publishedOn: "2026-04-31" }],
      }).success,
    ).toBe(false);
    expect(
      signalPayloadSchema.safeParse({
        ...payload,
        financing: { ...payload.financing, extra: "no" },
      }).success,
    ).toBe(false);
  });
  it("enforces currency and valuation semantics and canonicalizes investors", () => {
    for (const financing of [
      { ...payload.financing, currency: null },
      { ...payload.financing, currency: "XYZ" },
      { ...payload.financing, valuation: "1" },
      { ...payload.financing, valuationKind: "pre_money" },
    ])
      expect(
        signalPayloadSchema.safeParse({ ...payload, financing }).success,
      ).toBe(false);
    expect(
      signalPayloadSchema.parse({
        ...payload,
        financing: {
          ...payload.financing,
          investors: [" Zeta ", "Alpha", "Zeta"],
        },
      }).financing?.investors,
    ).toEqual(["Alpha", "Zeta"]);
    expect(
      signalPayloadSchema.safeParse({ ...payload, category: "product" })
        .success,
    ).toBe(false);
  });
  it("requires same-currency amount ranges and valid date intervals", () => {
    for (const filters of [
      { minAmount: "1" },
      { currency: "USD", minAmount: "2", maxAmount: "1" },
      { from: "2026-10-01", to: "2026-01-01" },
    ])
      expect(financingFiltersSchema.safeParse(filters).success).toBe(false);
    expect(
      financingFiltersSchema.parse({ currency: "USD", minAmount: "0001.2000" }),
    ).toEqual({ currency: "USD", minAmount: "1.2" });
  });
  it("distinguishes independent rounds but ignores corroborating sources for duplicate identity and materiality", () => {
    const withSource = {
      ...payload,
      sources: [
        ...payload.sources,
        { ...payload.sources[0], url: "https://other.example/news" },
      ],
    };
    expect(duplicateKey(payload)).toBe(duplicateKey(withSource));
    expect(materialChange(payload, withSource)).toBe(false);
    expect(duplicateKey(payload)).not.toBe(
      duplicateKey({ ...payload, title: "Separate extension round" }),
    );
    expect(materialChange(payload, { ...payload, status: "disputed" })).toBe(
      true,
    );
  });
});
