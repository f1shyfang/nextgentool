import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchError } from "../domain/types";

const f = vi.hoisted(() => ({
  actor: {
    userId: "user_test",
    firmId: "11111111-1111-4111-8111-111111111111",
    role: "contributor",
  },
  service: {
    save: vi.fn(),
    reserve: vi.fn(),
    workspace: vi.fn(),
    download: vi.fn(),
    update: vi.fn(),
    upload: vi.fn(),
    reconcile: vi.fn(),
  },
  deny: false,
}));
vi.mock("@/lib/research", () => ({
  researchActor: async () => {
    if (f.deny) throw new ResearchError("forbidden", "Sign in");
    return f.actor;
  },
  researchResources: () => ({ service: f.service }),
}));

import {
  GET,
  PATCH,
  POST,
  PUT,
} from "../../../app/api/research/[...path]/route";

const id = "22222222-2222-4222-8222-222222222222";
const request = (
  path: string,
  method: string,
  body?: unknown,
  origin = "http://localhost",
) =>
  new Request(`http://localhost/api/research/${path}`, {
    method,
    headers: { origin, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });
beforeEach(() => {
  vi.clearAllMocks();
  f.deny = false;
  f.actor.role = "contributor";
});
describe("shipped research routes", () => {
  it("validates JSON before saving and passes only authenticated actor to service", async () => {
    const input = {
      companyId: id,
      dealId: null,
      kind: "memo",
      expectedRevisionId: null,
      title: "Thesis",
      body: "",
      sections: {},
      label: "Interpretation",
      evidence: [],
    };
    f.service.save.mockResolvedValue({ id });
    expect(
      (
        await POST(
          request("records", "POST", { ...input, firmId: id }),
          context("records"),
        )
      ).status,
    ).toBe(400);
    expect(f.service.save).not.toHaveBeenCalled();
    expect(
      (await POST(request("records", "POST", input), context("records")))
        .status,
    ).toBe(200);
    expect(f.service.save).toHaveBeenCalledWith(f.actor, input);
  });
  it("rejects signed-out and cross-origin access", async () => {
    expect(
      (
        await POST(
          request("records", "POST", {}, "http://other.example"),
          context("records"),
        )
      ).status,
    ).toBe(403);
    f.deny = true;
    expect(
      (await GET(request(`files/${id}`, "GET"), context("files", id))).status,
    ).toBe(403);
    expect(f.service.download).not.toHaveBeenCalled();
  });
  it("checks file target access before reading upload bytes", async () => {
    f.service.workspace.mockResolvedValue({ documents: [] });
    const response = await PUT(
      request(`uploads/${id}`, "PUT", "not bytes"),
      context("uploads", id),
    );
    expect(response.status).toBe(404);
    expect(f.service.upload).not.toHaveBeenCalled();
    f.actor.role = "viewer";
    expect(
      (
        await PUT(
          request(`uploads/${id}`, "PUT", "not bytes"),
          context("uploads", id),
        )
      ).status,
    ).toBe(403);
  });
  it("delivers authorized downloads privately as attachments", async () => {
    f.service.download.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      filename: "pitch deck.pdf",
      mediaType: "application/pdf",
    });
    const response = await GET(
      request(`files/${id}`, "GET"),
      context("files", id),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-disposition")).toContain(
      "attachment;",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
  it("surfaces revision conflicts and denies invalid mutation shapes", async () => {
    f.service.update.mockRejectedValue(
      new ResearchError("conflict", "Changed"),
    );
    expect(
      (
        await PATCH(
          request(`items/${id}`, "PATCH", {
            kind: "document",
            title: "Updated",
          }),
          context("items", id),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await PATCH(
          request(`items/${id}`, "PATCH", {
            kind: "document",
            archived: "false",
          }),
          context("items", id),
        )
      ).status,
    ).toBe(400);
  });
});
