import { describe, expect, it } from "vitest";
import { compareDecimals } from "../domain/signal-policy";
import type {
  FinancingFilters,
  FinancingRow,
  ManualSignal,
  SignalPayload,
  SignalRepository,
  SignalRevision,
  SignalTransaction,
} from "../domain/signal-types";
import {
  type Actor,
  type Audit,
  type Company,
  CompanyError,
} from "../domain/types";
import { createManualSignalsService } from "./signals";

const cid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor: Actor = { userId: "analyst", firmId: "firm", role: "contributor" };
const payload: SignalPayload = {
  category: "financing",
  title: "Seed round",
  summary: "Seed round announcement",
  eventDate: { precision: "month", value: "2026-02" },
  sources: [
    {
      url: "https://example.com/round",
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
function setup() {
  let id = 0;
  const clock = {
    now: () => "2026-10-24T01:00:00.000Z",
    id: () => `bbbbbbbb-bbbb-4bbb-8bbb-${String(++id).padStart(12, "0")}`,
  };
  let state: {
    company: Company;
    signals: ManualSignal[];
    revisions: SignalRevision[];
    rounds: FinancingRow[];
    audits: Audit[];
  } = {
    company: {
      id: cid,
      firmId: actor.firmId,
      name: "Company",
      domain: null,
      version: 1,
      createdAt: clock.now(),
      updatedAt: clock.now(),
    },
    signals: [],
    revisions: [],
    rounds: [],
    audits: [],
  };
  const replays = new Map<string, { fingerprint: string; result: unknown }>();
  let failAudit = false;
  function transaction(currentActor: Actor): SignalTransaction {
    const scoped = () => currentActor.firmId === state.company.firmId;
    const detail = (signal: ManualSignal) => ({
      signal,
      revisions: state.revisions.filter(
        (revision) => revision.signalId === signal.id,
      ),
    });
    const filter = (row: FinancingRow, filters: FinancingFilters) =>
      (!filters.currency || row.currency === filters.currency) &&
      (!filters.roundType || row.roundType === filters.roundType) &&
      (!filters.minAmount ||
        (row.amount !== null &&
          compareDecimals(row.amount, filters.minAmount) >= 0)) &&
      (!filters.maxAmount ||
        (row.amount !== null &&
          compareDecimals(row.amount, filters.maxAmount) <= 0)) &&
      (!filters.from ||
        (row.dateEnd !== null && row.dateEnd >= filters.from)) &&
      (!filters.to || (row.dateStart !== null && row.dateStart <= filters.to));
    return {
      async getCompany(companyId) {
        return scoped() && companyId === cid
          ? structuredClone(state.company)
          : null;
      },
      async bumpVersion(companyId, expected, now) {
        if (companyId !== cid || state.company.version !== expected)
          throw new CompanyError("conflict", "Version changed");
        state.company.version++;
        state.company.updatedAt = now;
      },
      async listSignals() {
        return scoped() ? state.signals.map(detail) : [];
      },
      async getSignal(companyId, signalId) {
        const signal = state.signals.find(
          (item) => item.companyId === companyId && item.id === signalId,
        );
        return scoped() && signal ? detail(signal) : null;
      },
      async findDuplicate(companyId, key, excludeId) {
        return (
          state.signals.find(
            (item) =>
              item.companyId === companyId &&
              item.duplicateKey === key &&
              item.id !== excludeId,
          ) ?? null
        );
      },
      async insertSignal(signal) {
        state.signals.push(signal);
      },
      async saveSignal(signal, expectedVersion) {
        const index = state.signals.findIndex(
          (item) => item.id === signal.id && item.version === expectedVersion,
        );
        if (index < 0)
          throw new CompanyError("conflict", "Signal version changed");
        state.signals[index] = signal;
      },
      async appendRevision(revision) {
        state.revisions.push(revision);
      },
      async replaceFinancing(_, signalId, row) {
        state.rounds = state.rounds.filter(
          (item) => item.signalId !== signalId,
        );
        if (row) state.rounds.push(row);
      },
      async financingHistory(_, filters) {
        return state.rounds.filter((row) => filter(row, filters));
      },
      async appendAudit(audit) {
        if (failAudit) throw new Error("Audit write failed");
        state.audits.push(audit);
      },
    };
  }
  const repository: SignalRepository = {
    async read(currentActor, operation) {
      return operation(transaction(currentActor));
    },
    async write(currentActor, requestId, fingerprint, operation) {
      const key = `${currentActor.firmId}/${currentActor.userId}/${requestId}`;
      const cached = replays.get(key);
      if (cached) {
        if (cached.fingerprint !== fingerprint)
          throw new CompanyError("conflict", "Request reused");
        return structuredClone(cached.result) as Awaited<
          ReturnType<typeof operation>
        >;
      }
      const before = structuredClone(state);
      try {
        const result = await operation(transaction(currentActor));
        replays.set(key, { fingerprint, result: structuredClone(result) });
        return result;
      } catch (error) {
        state = before;
        throw error;
      }
    },
  };
  const service = createManualSignalsService({ repository, clock });
  const create = (
    data: Partial<SignalPayload> = {},
    version = state.company.version,
  ) =>
    service.createSignal(actor, cid, {
      requestId: clock.id(),
      expectedCompanyVersion: version,
      payload: { ...payload, ...data },
    });
  const correct = (
    signalId: string,
    data: Partial<SignalPayload>,
    expectedSignalVersion = state.signals.find(
      (item) => item.id === signalId.toLowerCase(),
    )?.version,
  ) =>
    service.correctSignal(actor, cid, signalId, {
      requestId: clock.id(),
      expectedCompanyVersion: state.company.version,
      expectedSignalVersion,
      payload: { ...payload, ...data },
      reason: "Verified corrected evidence",
    });
  return {
    service,
    clock,
    create,
    correct,
    state: () => state,
    failAudit: () => {
      failAudit = true;
    },
  };
}
describe("manual signals service", () => {
  it("creates a sourced financing event without rounding and returns canonical dates", async () => {
    const test = setup();
    const workspace = await test.create();
    expect(workspace.companyVersion).toBe(2);
    expect(workspace.companyUpdatedAt).toBe(test.clock.now());
    expect(workspace.signals[0].signal.version).toBe(1);
    const { rounds } = await test.service.financingHistory(actor, cid);
    expect(rounds[0]).toMatchObject({
      amount: "99999999999999999999.9999",
      dateStart: "2026-02-01",
      dateEnd: "2026-02-28",
    });
    expect(
      (
        await test.service.financingHistory(actor, cid, {
          from: "2026-02-15",
          to: "2026-02-16",
          currency: "USD",
          minAmount: "99999999999999999999.9998",
        })
      ).rounds,
    ).toHaveLength(1);
    expect(
      (await test.service.financingHistory(actor, cid, { currency: "AUD" }))
        .rounds,
    ).toHaveLength(0);
  });
  it("preserves immutable revision history and marks source-only corrections nonmaterial", async () => {
    const test = setup();
    const initial = await test.create();
    const original = structuredClone(initial.signals[0].revisions[0]);
    const changed = await test.correct(
      initial.signals[0].signal.id.toUpperCase(),
      {
        sources: [
          ...payload.sources,
          { ...payload.sources[0], url: "https://another.example/news" },
        ],
      },
    );
    expect(changed.signals[0].revisions[0]).toEqual(original);
    expect(changed.signals[0].revisions[1].material).toBe(false);
    expect(changed.signals[0].signal.version).toBe(2);
    expect(test.state().audits[1].detail).toMatchObject({
      previousRevisionId: original.id,
      revision: 2,
      reason: "Verified corrected evidence",
      material: false,
    });
  });
  it("replaces the current round and removes disputed, retracted and recategorized financing", async () => {
    const test = setup();
    const initial = await test.create();
    const signalId = initial.signals[0].signal.id;
    await test.correct(signalId, {
      financing: {
        roundType: "seed",
        amount: "10",
        currency: "AUD",
        investors: ["Alpha"],
        valuation: null,
        valuationKind: null,
      },
    });
    expect(test.state().rounds).toHaveLength(1);
    expect(test.state().rounds[0].currency).toBe("AUD");
    await test.correct(signalId, { status: "disputed" });
    expect(test.state().rounds).toHaveLength(0);
    await test.correct(signalId, { status: "verified" });
    expect(test.state().rounds).toHaveLength(1);
    await test.correct(signalId, { status: "retracted" });
    expect(test.state().rounds).toHaveLength(0);
    await test.correct(signalId, { category: "product", financing: null });
    expect(test.state().rounds).toHaveLength(0);
    expect(
      (await test.service.workspace(actor, cid)).signals[0].revisions,
    ).toHaveLength(6);
  });
  it("blocks exact duplicates but accepts explicitly justified distinct events and independent same-day rounds", async () => {
    const test = setup();
    await test.create();
    await expect(
      test.create({ summary: "Same event reported elsewhere" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await test.service.createSignal(actor, cid, {
      requestId: test.clock.id(),
      expectedCompanyVersion: 2,
      payload,
      duplicateReason: "Separate documented tranche",
    });
    expect(test.state().audits[1].detail.duplicateReason).toBe(
      "Separate documented tranche",
    );
    await test.create({ title: "Seed extension" });
    expect(test.state().signals).toHaveLength(3);
  });
  it("enforces contributor access, scope, optimistic versions and valid observations", async () => {
    const test = setup();
    await expect(
      test.service.createSignal({ ...actor, role: "viewer" }, cid, {}),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      test.service.workspace({ ...actor, firmId: "another" }, cid),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      test.create({
        sources: [
          { ...payload.sources[0], observedAt: "2027-01-01T00:00:00.000Z" },
        ],
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    const initial = await test.create();
    await expect(
      test.create({ title: "Another round" }, 1),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      test.correct(initial.signals[0].signal.id, {}, 2),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      test.service.financingHistory(actor, cid, { minAmount: "1" }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(test.state().revisions).toHaveLength(1);
  });
  it("replays canonical IDs without adding events and rejects changed reuse", async () => {
    const test = setup();
    const input = {
      requestId: test.clock.id(),
      expectedCompanyVersion: 1,
      payload,
    };
    const first = await test.service.createSignal(actor, cid.toUpperCase(), {
      ...input,
      requestId: input.requestId.toUpperCase(),
    });
    expect(await test.service.createSignal(actor, cid, input)).toEqual(first);
    await expect(
      test.service.createSignal(actor, cid, {
        ...input,
        payload: { ...payload, title: "Changed" },
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(test.state().company.version).toBe(2);
    expect(test.state().signals).toHaveLength(1);
  });
  it("rolls back partial signal, projection, revision and version changes when an audit fails", async () => {
    const test = setup();
    test.failAudit();
    await expect(test.create()).rejects.toThrow("Audit write failed");
    expect(test.state()).toMatchObject({
      signals: [],
      revisions: [],
      rounds: [],
      audits: [],
      company: { version: 1 },
    });
  });
  it("replays a correction and checks duplicate identity excluding the edited signal", async () => {
    const test = setup();
    const initial = await test.create();
    const signalId = initial.signals[0].signal.id;
    const input = {
      requestId: test.clock.id(),
      expectedCompanyVersion: 2,
      expectedSignalVersion: 1,
      payload: { ...payload, status: "verified" },
      reason: "Confirmed announcement",
    };
    const first = await test.service.correctSignal(actor, cid, signalId, input);
    expect(
      await test.service.correctSignal(
        actor,
        cid.toUpperCase(),
        signalId.toUpperCase(),
        input,
      ),
    ).toEqual(first);
    expect(test.state().revisions).toHaveLength(2);
    await test.create({ title: "Separate round" });
    await expect(
      test.correct(signalId, { title: "Separate round" }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(test.state().revisions).toHaveLength(3);
  });
  it("restores previous financing and immutable history after a failed correction", async () => {
    const test = setup();
    const initial = await test.create();
    const before = structuredClone(test.state());
    test.failAudit();
    await expect(
      test.correct(initial.signals[0].signal.id, { status: "retracted" }),
    ).rejects.toThrow("Audit write failed");
    expect(test.state()).toEqual(before);
  });
});
