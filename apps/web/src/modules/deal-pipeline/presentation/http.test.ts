import { describe, expect, it, vi } from "vitest";

// Importing this boundary must never initialize Clerk or a real database.
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/composition-root", () => ({
  createDealPipelineCompositionRoot: vi.fn(),
}));

import { readMutation } from "./http";

const input = { requestId: "request-fixture", name: "E2E boundary fixture" };
function mutation(
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(input),
) {
  return new Request("http://localhost:3100/api/pipeline/deals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3100",
      ...headers,
    },
    body,
  });
}

describe("Deal Pipeline mutation HTTP boundary", () => {
  it("accepts direct requests from the application origin", async () => {
    await expect(readMutation(mutation())).resolves.toEqual(input);
  });
  it("accepts the public Host when the Next.js URL is internal", async () => {
    await expect(
      readMutation(
        mutation({ host: "localhost:3101", origin: "http://localhost:3101" }),
      ),
    ).resolves.toEqual(input);
  });
  it("accepts the forwarded public host after TLS termination", async () => {
    await expect(
      readMutation(
        mutation({
          host: "internal:3100",
          "x-forwarded-host": "pipeline.example.test",
          origin: "https://pipeline.example.test",
        }),
      ),
    ).resolves.toEqual(input);
  });
  it("uses the first trimmed public host in a chained proxy header", async () => {
    await expect(
      readMutation(
        mutation({
          host: "internal:3100",
          "x-forwarded-host": " pipeline.example.test, internal.proxy ",
          origin: "https://pipeline.example.test",
        }),
      ),
    ).resolves.toEqual(input);
  });
  it("falls back to Host when the forwarded host is blank", async () => {
    await expect(
      readMutation(
        mutation({
          host: "pipeline.example.test",
          "x-forwarded-host": " ",
          origin: "https://pipeline.example.test",
        }),
      ),
    ).resolves.toEqual(input);
  });
  it.each<Record<string, string>>([
    { origin: "https://attacker.example.test" },
    { origin: "http://localhost:3101" },
    { host: "localhost:3101", origin: "http://localhost:3100" },
    {
      host: "localhost:3100",
      "x-forwarded-host": "pipeline.example.test",
      origin: "http://localhost:3100",
    },
    { origin: "not an origin" },
    { origin: "null" },
    { origin: "ftp://localhost:3100" },
  ])(
    "rejects a foreign, malformed, or unsupported origin: %j",
    async (headers) => {
      await expect(readMutation(mutation(headers))).rejects.toMatchObject({
        code: "forbidden",
      });
    },
  );
  it("rejects cross-site fetches even when the origin host matches", async () => {
    await expect(
      readMutation(mutation({ "sec-fetch-site": "cross-site" })),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("rejects malformed JSON", async () => {
    await expect(readMutation(mutation({}, "{broken"))).rejects.toMatchObject({
      code: "invalid",
    });
  });
  it("rejects non-JSON request bodies", async () => {
    await expect(
      readMutation(mutation({ "content-type": "text/plain" })),
    ).rejects.toMatchObject({ code: "invalid" });
  });
  it("accepts JSON with an explicit charset", async () => {
    await expect(
      readMutation(
        mutation({ "content-type": "application/json; charset=utf-8" }),
      ),
    ).resolves.toEqual(input);
  });
  it("rejects a missing body", async () => {
    await expect(readMutation(mutation({}, null))).rejects.toMatchObject({
      code: "invalid",
    });
  });
  it("rejects an oversized declared content length before parsing", async () => {
    await expect(
      readMutation(mutation({ "content-length": "32769" })),
    ).rejects.toMatchObject({ code: "invalid" });
  });
  it("enforces the actual byte limit when content length is omitted", async () => {
    await expect(
      readMutation(
        mutation({}, JSON.stringify({ summary: "é".repeat(16384) })),
      ),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});
