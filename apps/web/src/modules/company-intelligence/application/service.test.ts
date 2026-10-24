import { describe, expect, it } from "vitest";
import {
  type Actor,
  type Assertion,
  type Audit,
  type Company,
  CompanyError,
  type CompanyRepository,
  type CompanyTransaction,
  type Override,
} from "../domain/types";
import { createCompanyService } from "./service";

const actor: Actor = { userId: "user", firmId: "firm", role: "contributor" };
const viewer: Actor = { ...actor, role: "viewer" };
let sequence = 0;
const id = () =>
  `abcdefab-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
function harness() {
  let state: {
    companies: Company[];
    assertions: Assertion[];
    overrides: Override[];
    audits: Audit[];
  } = { companies: [], assertions: [], overrides: [], audits: [] };
  const requests = new Map<string, { fingerprint: string; result: unknown }>();
  const tx: CompanyTransaction = {
    async listCompanies({ q, limit, after }) {
      return state.companies
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q.toLowerCase()) &&
            (!after || c.id > after),
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, limit);
    },
    async candidates(name, domain) {
      return state.companies.filter(
        (c) =>
          c.name.toLowerCase() === name.toLowerCase() ||
          (!!domain && c.domain === domain),
      );
    },
    async getCompany(companyId) {
      return state.companies.find((c) => c.id === companyId) ?? null;
    },
    async insertCompany(company) {
      state.companies.push(company);
    },
    async bumpVersion(companyId, version, updatedAt) {
      const c = state.companies.find((c) => c.id === companyId);
      if (!c) throw new CompanyError("not_found", "Company not found");
      if (c.version !== version)
        throw new CompanyError("conflict", "Version changed");
      c.version++;
      c.updatedAt = updatedAt;
    },
    async assertions(companyId) {
      return state.assertions.filter((a) => a.companyId === companyId);
    },
    async insertAssertion(assertion) {
      state.assertions.push(assertion);
    },
    async reviewAssertion(assertionId, companyId, reviewStatus) {
      const assertion = state.assertions.find(
        (a) => a.id === assertionId && a.companyId === companyId,
      );
      if (!assertion)
        throw new CompanyError("not_found", "Assertion not found");
      assertion.reviewStatus = reviewStatus;
    },
    async overrides(companyId) {
      return state.overrides.filter((o) => o.companyId === companyId);
    },
    async releaseOverrides(companyId, field) {
      state.overrides
        .filter((o) => o.companyId === companyId && o.field === field)
        .forEach((o) => {
          o.active = false;
        });
    },
    async insertOverride(override) {
      state.overrides.push(override);
    },
    async appendAudit(audit) {
      state.audits.push(audit);
    },
  };
  const repository: CompanyRepository = {
    async actorFor() {
      return actor;
    },
    async read(_actor, operation) {
      return structuredClone(await operation(tx));
    },
    async write(_actor, requestId, fingerprint, operation) {
      const prior = requests.get(requestId);
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new CompanyError("conflict", "Request reused");
        return structuredClone(prior.result) as Awaited<
          ReturnType<typeof operation>
        >;
      }
      const before = structuredClone(state);
      try {
        const result = structuredClone(await operation(tx));
        requests.set(requestId, { fingerprint, result });
        return result;
      } catch (error) {
        state = before;
        throw error;
      }
    },
  };
  const service = createCompanyService({
    repository,
    clock: { id, now: () => "2026-10-24T00:00:00.000Z" },
  });
  const create = (name = "Acme") =>
    service.createCompany(actor, {
      requestId: id(),
      name,
      domain: "www.acme.com",
    });
  const evidence = (expectedVersion = 1) => ({
    requestId: id(),
    expectedVersion,
    field: "description",
    value: "Research tools",
    sourceUrl: "https://acme.com/about",
    sourceTitle: "Company website",
    observedAt: "2026-10-01T12:00:00Z",
    claimKind: "reported",
  });
  return { service, create, evidence, state: () => state };
}
describe("company research application", () => {
  it("previews only exact normalized identities without creating records", async () => {
    const h = harness();
    const company = await h.create("Acme Research");
    expect(
      await h.service.companyCandidates(viewer, {
        name: "  ACME   Research ",
        domain: null,
      }),
    ).toEqual({ companies: [company] });
    expect(
      await h.service.companyCandidates(viewer, {
        name: "Different name",
        domain: "https://www.acme.com/",
      }),
    ).toEqual({ companies: [company] });
    expect(
      await h.service.companyCandidates(viewer, { name: "Acme", domain: null }),
    ).toEqual({ companies: [] });
    expect(h.state().companies).toHaveLength(1);
    expect(h.state().audits).toHaveLength(1);
    await expect(
      h.service.companyCandidates(viewer, {
        name: "Acme",
        domain: "https://acme.com/company",
      }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
  it("blocks duplicate identity unless a distinct-company reason is recorded", async () => {
    const h = harness();
    await h.create();
    await expect(h.create("ACME")).rejects.toMatchObject({ code: "conflict" });
    await h.service.createCompany(actor, {
      requestId: id(),
      name: "ACME",
      domain: "acme.com",
      duplicateReason: "Separate subsidiary",
    });
    expect(h.state().companies).toHaveLength(2);
    expect(h.state().audits[1].detail.duplicateReason).toBe(
      "Separate subsidiary",
    );
  });
  it("retains source traceability and provides suspended, recoverable overrides", async () => {
    const h = harness();
    const company = await h.create();
    const added = await h.service.addAssertion(actor, company.id, h.evidence());
    const assertion = added.assertions[0];
    expect(added.company.version).toBe(2);
    expect(assertion).toMatchObject({
      sourceUrl: "https://acme.com/about",
      sourceTitle: "Company website",
      createdBy: actor.userId,
    });
    const pinned = await h.service.setOverride(actor, company.id, {
      requestId: id(),
      expectedVersion: 2,
      field: "description",
      assertionId: assertion.id,
      reason: "Checked primary source",
    });
    const disputed = await h.service.reviewAssertion(
      actor,
      company.id,
      assertion.id,
      {
        requestId: id(),
        expectedVersion: 3,
        reviewStatus: "disputed",
        reason: "Outdated description",
      },
    );
    expect(disputed.fields.description).toMatchObject({
      value: null,
      overrideId: pinned.overrides[0].id,
      overrideSuspended: true,
    });
    const restored = await h.service.reviewAssertion(
      actor,
      company.id,
      assertion.id,
      {
        requestId: id(),
        expectedVersion: 4,
        reviewStatus: "verified",
        reason: "Reconfirmed",
      },
    );
    expect(restored.fields.description.overrideSuspended).toBe(false);
    const released = await h.service.releaseOverride(
      actor,
      company.id,
      pinned.overrides[0].id,
      { requestId: id(), expectedVersion: 5, reason: "Use default policy" },
    );
    expect(released.overrides[0].active).toBe(false);
    expect(released.company.version).toBe(6);
  });
  it("rejects viewer writes before persistence while allowing profile reads", async () => {
    const h = harness();
    const company = await h.create();
    await expect(
      h.service.addAssertion(viewer, company.id, h.evidence()),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      h.service.reviewAssertion(viewer, company.id, id(), {
        requestId: id(),
        expectedVersion: 1,
        reviewStatus: "verified",
        reason: "Checked",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect((await h.service.profile(viewer, company.id)).company.id).toBe(
      company.id,
    );
    expect(h.state().audits).toHaveLength(1);
  });
  it("rejects stale writes and cross-company assertion IDs atomically", async () => {
    const h = harness();
    const company = await h.create();
    const other = await h.service.createCompany(actor, {
      requestId: id(),
      name: "Other",
    });
    const added = await h.service.addAssertion(actor, company.id, h.evidence());
    await expect(
      h.service.addAssertion(actor, company.id, h.evidence()),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      h.service.reviewAssertion(actor, other.id, added.assertions[0].id, {
        requestId: id(),
        expectedVersion: 1,
        reviewStatus: "verified",
        reason: "Checked",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(h.state().assertions).toHaveLength(1);
    expect((await h.service.profile(actor, other.id)).company.version).toBe(1);
  });
  it("validates strict requests, field types, dates and public references", async () => {
    const h = harness();
    const company = await h.create();
    for (const patch of [
      { field: "foundingYear", value: 2027 },
      { field: "sector", value: "software" },
      { value: "" },
      { observedAt: "2027-01-01T00:00:00Z" },
      { sourceUrl: "https://user:password@example.com" },
      { sourceUrl: "http://127.0.0.1" },
      { unexpected: true },
    ]) {
      await expect(
        h.service.addAssertion(actor, company.id, {
          ...h.evidence(),
          ...patch,
        }),
      ).rejects.toMatchObject({ code: "invalid" });
    }
    expect(h.state().assertions).toHaveLength(0);
  });
  it("replays matching requests and rejects payload reuse", async () => {
    const h = harness();
    const request = { requestId: id(), name: "Acme" };
    const first = await h.service.createCompany(actor, request);
    expect(await h.service.createCompany(actor, request)).toEqual(first);
    await expect(
      h.service.createCompany(actor, { ...request, name: "Other" }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(h.state().companies).toHaveLength(1);
  });
  it("canonicalizes uppercase UUIDs for routes, child references, cursors and replay", async () => {
    const h = harness();
    const createRequest = { requestId: id(), name: "Acme" };
    const company = await h.service.createCompany(actor, {
      ...createRequest,
      requestId: createRequest.requestId.toUpperCase(),
    });
    expect(await h.service.createCompany(actor, createRequest)).toEqual(
      company,
    );
    const addRequest = h.evidence();
    const added = await h.service.addAssertion(
      actor,
      company.id.toUpperCase(),
      { ...addRequest, requestId: addRequest.requestId.toUpperCase() },
    );
    expect(await h.service.addAssertion(actor, company.id, addRequest)).toEqual(
      added,
    );
    expect(added.assertions[0].companyId).toBe(company.id);
    const assertionId = added.assertions[0].id;
    const reviewRequest = {
      requestId: id(),
      expectedVersion: 2,
      reviewStatus: "verified",
      reason: "Checked",
    };
    const reviewed = await h.service.reviewAssertion(
      actor,
      company.id.toUpperCase(),
      assertionId.toUpperCase(),
      { ...reviewRequest, requestId: reviewRequest.requestId.toUpperCase() },
    );
    expect(
      await h.service.reviewAssertion(
        actor,
        company.id,
        assertionId,
        reviewRequest,
      ),
    ).toEqual(reviewed);
    expect(h.state().audits.at(-1)?.detail.previousStatus).toBe("unreviewed");
    const pinRequest = {
      requestId: id(),
      expectedVersion: 3,
      field: "description",
      assertionId,
      reason: "Primary evidence",
    };
    const pinned = await h.service.setOverride(
      actor,
      company.id.toUpperCase(),
      {
        ...pinRequest,
        requestId: pinRequest.requestId.toUpperCase(),
        assertionId: assertionId.toUpperCase(),
      },
    );
    expect(await h.service.setOverride(actor, company.id, pinRequest)).toEqual(
      pinned,
    );
    const overrideId = pinned.overrides[0].id;
    const releaseRequest = {
      requestId: id(),
      expectedVersion: 4,
      reason: "Default policy",
    };
    const released = await h.service.releaseOverride(
      actor,
      company.id.toUpperCase(),
      overrideId.toUpperCase(),
      { ...releaseRequest, requestId: releaseRequest.requestId.toUpperCase() },
    );
    expect(
      await h.service.releaseOverride(
        actor,
        company.id,
        overrideId,
        releaseRequest,
      ),
    ).toEqual(released);
    expect(
      (await h.service.profile(actor, company.id.toUpperCase())).company.id,
    ).toBe(company.id);
    await h.service.createCompany(actor, { requestId: id(), name: "Beta" });
    const next = await h.service.listCompanies(actor, {
      after: company.id.toUpperCase(),
      limit: 1,
    });
    expect(next.companies[0].name).toBe("Beta");
  });
  it("paginates without dropping the first row of the next page", async () => {
    const h = harness();
    await h.create();
    await h.service.createCompany(actor, { requestId: id(), name: "Beta" });
    const first = await h.service.listCompanies(actor, { limit: 1 });
    expect(first.nextCursor).toBe(first.companies[0].id);
    const second = await h.service.listCompanies(actor, {
      limit: 1,
      after: first.nextCursor,
    });
    expect(second.companies[0].name).toBe("Beta");
    expect(second.nextCursor).toBeNull();
  });
});
