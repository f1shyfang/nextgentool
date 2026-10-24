import { describe, expect, it } from "vitest";
import { ResearchError } from "../domain/types";
import { boundedBytes, errorResponse, jsonBody, sameOrigin } from "./http";

describe("research HTTP boundary", () => {
  it("rejects cross-origin and missing-origin writes", () => {
    for (const origin of [undefined, "https://attacker.example"]) {
      expect(() =>
        sameOrigin(
          new Request("https://research.example/api/research", {
            method: "POST",
            headers: origin ? { origin } : {},
          }),
        ),
      ).toThrow(ResearchError);
    }
    expect(() =>
      sameOrigin(
        new Request("https://research.example/api/research", {
          method: "POST",
          headers: { origin: "https://research.example" },
        }),
      ),
    ).not.toThrow();
  });
  it("enforces actual streamed length even without a content-length header", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      body: "x".repeat(100),
    });
    await expect(boundedBytes(request, 10)).rejects.toMatchObject({
      code: "invalid",
    });
  });
  it("rejects non-object JSON and malformed requests", async () => {
    for (const body of ["null", "[]", "1", "bad json"])
      await expect(
        jsonBody(new Request("http://localhost/api", { method: "POST", body })),
      ).rejects.toThrow();
  });
  it("maps conflicts and unavailable errors without exposing internals", async () => {
    expect(
      errorResponse(new ResearchError("conflict", "New revision")).status,
    ).toBe(409);
    const response = errorResponse(new Error("secret connection string"));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});
