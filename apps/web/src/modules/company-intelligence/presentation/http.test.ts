import { describe, expect, it, vi } from "vitest";
import type { createCompanyService } from "../application/service";
import { type Actor, CompanyError } from "../domain/types";
import { createCompanyHttpHandler } from "./http";

const actor: Actor = {
  userId: "user_test",
  firmId: "11111111-1111-4111-8111-111111111111",
  role: "contributor",
};
function fixture() {
  const service = {
    companyCandidates: vi.fn(async () => ({ companies: [] })),
    listCompanies: vi.fn(async () => ({ companies: [], nextCursor: null })),
    profile: vi.fn(async () => ({ company: { name: "Example" } })),
    createCompany: vi.fn(async () => ({ name: "Example" })),
    addAssertion: vi.fn(async () => ({})),
    reviewAssertion: vi.fn(async () => ({})),
    setOverride: vi.fn(async () => ({})),
    releaseOverride: vi.fn(async () => ({})),
  };
  const logError = vi.fn();
  const session = vi.fn(async () => ({
    actor,
    service: service as unknown as ReturnType<typeof createCompanyService>,
  }));
  return {
    service,
    session,
    logError,
    handle: createCompanyHttpHandler({ session, logError }),
  };
}
const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/company-intelligence/companies", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
      ...headers,
    },
    body,
  });

describe("Company Intelligence HTTP boundary", () => {
  it("checks duplicate candidates through the authenticated exact-match service", async () => {
    const f = fixture();
    const input = { name: "Example", domain: null };
    const response = await f.handle(post(JSON.stringify(input)), [
      "company-candidates",
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(f.service.companyCandidates).toHaveBeenCalledWith(actor, input);
    expect(f.service.createCompany).not.toHaveBeenCalled();
  });
  it("returns an uncached authenticated list with bounded query arguments", async () => {
    const f = fixture();
    const response = await f.handle(
      new Request(
        "http://localhost/api/company-intelligence/companies?q=Example&limit=10",
      ),
      ["companies"],
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
    expect(f.service.listCompanies).toHaveBeenCalledWith(actor, {
      q: "Example",
      limit: 10,
      after: null,
    });
  });
  it("checks authentication before parsing or changing data", async () => {
    const f = fixture();
    f.session.mockRejectedValue(new CompanyError("unauthenticated", "Sign in"));
    const response = await f.handle(post("invalid"), ["companies"]);
    expect(response.status).toBe(401);
    expect(f.service.createCompany).not.toHaveBeenCalled();
  });
  it("rejects cross-origin, absent-origin, invalid JSON and oversized requests", async () => {
    const f = fixture();
    expect(
      (
        await f.handle(post("{}", { origin: "https://other.example" }), [
          "companies",
        ])
      ).status,
    ).toBe(403);
    expect(
      (await f.handle(post("{}", { origin: "" }), ["companies"])).status,
    ).toBe(403);
    expect(
      (
        await f.handle(post("{}", { "sec-fetch-site": "cross-site" }), [
          "companies",
        ])
      ).status,
    ).toBe(403);
    expect((await f.handle(post("bad json"), ["companies"])).status).toBe(400);
    expect(
      (await f.handle(post(`{"text":"${"x".repeat(32768)}"}`), ["companies"]))
        .status,
    ).toBe(400);
    expect(f.service.createCompany).not.toHaveBeenCalled();
  });
  it("creates only through the scoped application use case", async () => {
    const f = fixture();
    const body = { name: "Example", requestId: crypto.randomUUID() };
    expect(
      (await f.handle(post(JSON.stringify(body)), ["companies"])).status,
    ).toBe(201);
    expect(f.service.createCompany).toHaveBeenCalledWith(actor, body);
  });
  it("routes corrections and override release with both company and child IDs", async () => {
    const f = fixture();
    const body = {
      expectedVersion: 3,
      reason: "Reviewed",
      requestId: crypto.randomUUID(),
    };
    expect(
      (
        await f.handle(post(JSON.stringify(body)), [
          "companies",
          "company-id",
          "assertions",
          "assertion-id",
          "reviews",
        ])
      ).status,
    ).toBe(200);
    expect(f.service.reviewAssertion).toHaveBeenCalledWith(
      actor,
      "company-id",
      "assertion-id",
      body,
    );
    expect(
      (
        await f.handle(post(JSON.stringify(body)), [
          "companies",
          "company-id",
          "overrides",
          "override-id",
          "release",
        ])
      ).status,
    ).toBe(200);
    expect(f.service.releaseOverride).toHaveBeenCalledWith(
      actor,
      "company-id",
      "override-id",
      body,
    );
  });
  it("maps membership, missing-record and stale-version errors without caching", async () => {
    for (const [code, status] of [
      ["forbidden", 403],
      ["not_found", 404],
      ["conflict", 409],
    ] as const) {
      const f = fixture();
      f.service.profile.mockRejectedValue(
        new CompanyError(code, "Safe detail"),
      );
      const response = await f.handle(
        new Request("http://localhost/api/company-intelligence/companies/x"),
        ["companies", "x"],
      );
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });
  it("hides unexpected errors and logs only a name/correlation identifier", async () => {
    const f = fixture();
    f.service.profile.mockRejectedValue(new Error("secret database URL"));
    const response = await f.handle(
      new Request("http://localhost/api/company-intelligence/companies/x"),
      ["companies", "x"],
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
    expect(f.logError).toHaveBeenCalledWith("Error", expect.any(String));
  });
  it("rejects unknown/duplicate query parameters and unknown endpoints", async () => {
    const f = fixture();
    expect(
      (
        await f.handle(
          new Request(
            "http://localhost/api/company-intelligence/companies?firmId=other",
          ),
          ["companies"],
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.handle(
          new Request(
            "http://localhost/api/company-intelligence/companies?q=a&q=b",
          ),
          ["companies"],
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.handle(
          new Request("http://localhost/api/company-intelligence/missing"),
          ["missing"],
        )
      ).status,
    ).toBe(404);
    expect(f.service.listCompanies).not.toHaveBeenCalled();
  });
});
