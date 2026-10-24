import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  Actor,
  Evidence,
  ResearchRepository,
  SaveInput,
  UploadInput,
} from "../domain/types";
import { emptyState, ResearchError } from "../domain/types";
import { createResearchService } from "./service";

function fixture() {
  let state = emptyState();
  const companyId = randomUUID();
  const dealId = randomUUID();
  state.companies.push({ id: companyId, name: "Research company" });
  state.deals.push({ id: dealId, companyId, name: "Seed round" });
  const actor: Actor = {
    userId: "user_analyst",
    firmId: randomUUID(),
    role: "admin",
  };
  const check = (value: Actor) => {
    if (value.firmId !== actor.firmId)
      throw new ResearchError("forbidden", "Wrong firm");
  };
  const repository: ResearchRepository = {
    actorFor: async () => actor,
    read: async (value) => {
      check(value);
      return structuredClone(state);
    },
    transact: async (value, fn) => {
      check(value);
      const copy = structuredClone(state);
      const result = await fn(copy);
      state = copy;
      return result;
    },
  };
  const objects = new Map<string, Uint8Array>();
  let scannerFails = false;
  let malware = false;
  const service = createResearchService({
    repository,
    storage: {
      put: async (id, data) => {
        objects.set(id, data);
      },
      get: async (id) => {
        const data = objects.get(id);
        if (!data) throw Error("Missing");
        return data;
      },
      remove: async (id) => {
        objects.delete(id);
      },
      keys: async () => [],
    },
    inspector: {
      inspect: async () => {
        if (scannerFails) throw new ResearchError("unavailable", "Offline");
        if (malware) throw new ResearchError("invalid", "Malware");
        return { mediaType: "application/pdf", checksum: "hash" };
      },
    },
    clock: { id: randomUUID, now: () => "2026-10-24T00:00:00.000Z" },
  });
  const save: SaveInput = {
    companyId,
    dealId: null,
    kind: "note",
    expectedRevisionId: null,
    title: "Founder observations",
    body: "A research assessment.",
    sections: {},
    label: "Observation",
    evidence: [],
  };
  const upload: UploadInput = {
    companyId,
    dealId: null,
    title: "Pitch deck",
    category: "Pitch deck",
    description: "",
    filename: "deck.pdf",
    size: 3,
  };
  return {
    actor,
    service,
    save,
    upload,
    companyId,
    dealId,
    get state() {
      return state;
    },
    set scannerFails(v: boolean) {
      scannerFails = v;
    },
    set malware(v: boolean) {
      malware = v;
    },
  };
}
describe("Research workflows", () => {
  it("preserves note revisions and rejects stale edits without mutating saved content", async () => {
    const f = fixture();
    const first = await f.service.save(f.actor, f.save);
    const oldId = first.revisions[0].id;
    const second = await f.service.save(f.actor, {
      ...f.save,
      id: first.id,
      expectedRevisionId: oldId,
      body: "Updated",
    });
    expect(second.revisions.map((r) => r.body)).toEqual([
      "A research assessment.",
      "Updated",
    ]);
    await expect(
      f.service.save(f.actor, {
        ...f.save,
        id: first.id,
        expectedRevisionId: oldId,
        body: "Stale",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(f.state.records[0].revisions).toHaveLength(2);
  });
  it("pins memo references to exact document versions across replacements and archive", async () => {
    const f = fixture();
    const original = await f.service.reserve(f.actor, f.upload);
    await f.service.upload(
      f.actor,
      original.versionId,
      new Uint8Array([1, 2, 3]),
    );
    const ref: Evidence = {
      kind: "document",
      targetId: original.documentId,
      revisionId: original.versionId,
      locator: "Page 4",
    };
    const memo = await f.service.save(f.actor, {
      ...f.save,
      kind: "memo",
      evidence: [ref],
      sections: { Risks: "Execution risk" },
    });
    const replacement = await f.service.reserve(f.actor, {
      ...f.upload,
      documentId: original.documentId,
    });
    await f.service.upload(
      f.actor,
      replacement.versionId,
      new Uint8Array([4, 5, 6]),
    );
    await f.service.update(f.actor, original.documentId, {
      kind: "document",
      archived: true,
    });
    expect(f.state.records[0].revisions[0].evidence[0]).toEqual(ref);
    expect(memo.revisions[0].sections.Risks).toBe("Execution risk");
    expect(
      (
        await f.service.download(
          { ...f.actor, role: "viewer" },
          original.versionId,
        )
      ).bytes,
    ).toEqual(new Uint8Array([1, 2, 3]));
  });
  it("saves metadata edits when reserving a replacement version", async () => {
    const f = fixture();
    const doc = await f.service.reserve(f.actor, f.upload);
    await f.service.reserve(f.actor, {
      ...f.upload,
      documentId: doc.documentId,
      title: "Updated deck",
      category: "Financials",
      description: "New forecast",
    });
    expect(f.state.documents[0]).toMatchObject({
      title: "Updated deck",
      category: "Financials",
      description: "New forecast",
    });
  });
  it("keeps a prior ready version current when replacement fails, and recovers via retry", async () => {
    const f = fixture();
    const first = await f.service.reserve(f.actor, f.upload);
    await f.service.upload(f.actor, first.versionId, new Uint8Array([1, 2, 3]));
    const next = await f.service.reserve(f.actor, {
      ...f.upload,
      documentId: first.documentId,
    });
    f.scannerFails = true;
    const failed = await f.service.upload(
      f.actor,
      next.versionId,
      new Uint8Array([4, 5, 6]),
    );
    expect(failed.currentVersionId).toBe(first.versionId);
    expect(failed.versions[1].state).toBe("failed");
    await expect(
      f.service.download(f.actor, next.versionId),
    ).rejects.toMatchObject({ code: "forbidden" });
    f.scannerFails = false;
    const ready = await f.service.upload(f.actor, next.versionId);
    expect(ready.currentVersionId).toBe(next.versionId);
    const auditCount = f.state.audit.length;
    await f.service.upload(f.actor, next.versionId);
    expect(f.state.audit).toHaveLength(auditCount);
  });
  it("does not let late completion of an earlier upload make it current", async () => {
    const f = fixture();
    const a = await f.service.reserve(f.actor, f.upload);
    const b = await f.service.reserve(f.actor, {
      ...f.upload,
      documentId: a.documentId,
    });
    await f.service.upload(f.actor, b.versionId, new Uint8Array([4, 5, 6]));
    expect(
      (await f.service.upload(f.actor, a.versionId, new Uint8Array([1, 2, 3])))
        .currentVersionId,
    ).toBe(b.versionId);
  });
  it("blocks viewers from all writes and contributors from archive", async () => {
    const f = fixture();
    const viewer: Actor = { ...f.actor, role: "viewer" };
    await expect(f.service.save(viewer, f.save)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(f.service.reserve(viewer, f.upload)).rejects.toMatchObject({
      code: "forbidden",
    });
    const doc = await f.service.reserve(f.actor, f.upload);
    await expect(
      f.service.update({ ...f.actor, role: "contributor" }, doc.documentId, {
        kind: "document",
        archived: true,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(f.state.documents[0].archived).toBe(false);
  });
  it("rejects cross-company/deal references and unavailable evidence", async () => {
    const f = fixture();
    await expect(
      f.service.save(f.actor, { ...f.save, companyId: randomUUID() }),
    ).rejects.toMatchObject({ code: "missing" });
    await expect(
      f.service.save(f.actor, { ...f.save, dealId: randomUUID() }),
    ).rejects.toMatchObject({ code: "invalid" });
    const doc = await f.service.reserve(f.actor, {
      ...f.upload,
      dealId: f.dealId,
    });
    const ref: Evidence = {
      kind: "document",
      targetId: doc.documentId,
      revisionId: doc.versionId,
      locator: "",
    };
    await expect(
      f.service.save(f.actor, { ...f.save, evidence: [ref] }),
    ).rejects.toMatchObject({ code: "invalid" });
    await f.service.upload(f.actor, doc.versionId, new Uint8Array([1, 2, 3]));
    await expect(
      f.service.save(f.actor, { ...f.save, evidence: [ref] }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      f.service.workspace({ ...f.actor, firmId: randomUUID() }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("rejects malware and incomplete files without enabling downloads", async () => {
    const f = fixture();
    const first = await f.service.reserve(f.actor, f.upload);
    f.malware = true;
    expect(
      (
        await f.service.upload(
          f.actor,
          first.versionId,
          new Uint8Array([1, 2, 3]),
        )
      ).versions[0].state,
    ).toBe("rejected");
    await expect(
      f.service.download(f.actor, first.versionId),
    ).rejects.toMatchObject({ code: "forbidden" });
    const second = await f.service.reserve(f.actor, f.upload);
    expect(
      (await f.service.upload(f.actor, second.versionId, new Uint8Array([1])))
        .versions[0].state,
    ).toBe("rejected");
  });
  it("pins note revision citations and retains historical source content", async () => {
    const f = fixture();
    const note = await f.service.save(f.actor, f.save);
    await f.service.save(f.actor, {
      ...f.save,
      kind: "memo",
      evidence: [
        {
          kind: "note",
          targetId: note.id,
          revisionId: note.revisions[0].id,
          locator: "Interview",
        },
      ],
    });
    await f.service.save(f.actor, {
      ...f.save,
      id: note.id,
      expectedRevisionId: note.revisions[0].id,
      body: "Changed claim",
    });
    expect(f.state.records[1].revisions[0].evidence[0].revisionId).toBe(
      note.revisions[0].id,
    );
    expect(f.state.records[0].revisions[0].body).toBe("A research assessment.");
  });
});
