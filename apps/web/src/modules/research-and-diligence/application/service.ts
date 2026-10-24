import type {
  Actor,
  Clock,
  Evidence,
  FileInspector,
  PrivateStorage,
  ResearchRepository,
  ResearchState,
  SaveInput,
  Scope,
  UploadInput,
} from "../domain/types";
import { categories, memoSections, ResearchError } from "../domain/types";

function fail(
  code: ConstructorParameters<typeof ResearchError>[0],
  message: string,
): never {
  throw new ResearchError(code, message);
}
const text = (value: unknown, name: string, max = 500): string => {
  if (typeof value !== "string" || value.length > max)
    return fail(
      "invalid",
      `${name} must be text of at most ${max} characters.`,
    );
  return value;
};
function edit(actor: Actor) {
  if (actor.role === "viewer")
    fail("forbidden", "Contributor access is required.");
}
function scope(state: ResearchState, input: Scope) {
  if (!state.companies.some((c) => c.id === input.companyId))
    fail("missing", "Company not found.");
  if (
    input.dealId !== null &&
    !state.deals.some(
      (d) => d.id === input.dealId && d.companyId === input.companyId,
    )
  )
    fail("invalid", "Choose a deal belonging to this company.");
}
function evidence(state: ResearchState, input: Evidence[], context: Scope) {
  if (!Array.isArray(input) || input.length > 100)
    fail("invalid", "Choose at most 100 evidence references.");
  for (const ref of input) {
    text(ref.locator, "Source locator", 300);
    const source =
      ref.kind === "document"
        ? state.documents.find((d) => d.id === ref.targetId)
        : ref.kind === "note"
          ? state.records.find(
              (n) => n.id === ref.targetId && n.kind === "note",
            )
          : undefined;
    if (
      !source ||
      source.companyId !== context.companyId ||
      (source.dealId !== null && source.dealId !== context.dealId)
    )
      fail(
        "invalid",
        "Evidence must belong to this company and the selected deal context.",
      );
    if ("versions" in source) {
      if (
        !source.versions.some(
          (v) => v.id === ref.revisionId && v.state === "ready",
        )
      )
        fail("invalid", "Evidence must reference a ready document version.");
    } else if (!source.revisions.some((r) => r.id === ref.revisionId))
      fail("invalid", "Note revision not found.");
  }
}
function versionIn(state: ResearchState, versionId: string) {
  const document = state.documents.find((d) =>
    d.versions.some((v) => v.id === versionId),
  );
  const version = document?.versions.find((v) => v.id === versionId);
  if (!document || !version)
    return fail("missing", "Document version not found.");
  return { document, version };
}
export function createResearchService(deps: {
  repository: ResearchRepository;
  storage: PrivateStorage;
  inspector: FileInspector;
  clock: Clock;
}) {
  const { repository, storage, inspector, clock } = deps;
  const audit = (
    state: ResearchState,
    actor: Actor,
    action: string,
    targetId: string,
  ) =>
    state.audit.push({
      id: clock.id(),
      actor: actor.userId,
      action,
      targetId,
      createdAt: clock.now(),
    });
  return {
    async workspace(actor: Actor) {
      return { ...(await repository.read(actor)), actor };
    },
    async save(actor: Actor, input: SaveInput) {
      edit(actor);
      return repository.transact(actor, (state) => {
        scope(state, input);
        if (input.kind !== "note" && input.kind !== "memo")
          fail("invalid", "Choose a note or memo.");
        const title = text(input.title, "Title", 200).trim();
        if (!title) fail("invalid", "Enter a title.");
        const body = text(input.body, "Note", 100000);
        if (
          !["Observation", "Interpretation", "Open question"].includes(
            input.label,
          )
        )
          fail("invalid", "Choose a note label.");
        const sections: Record<string, string> = {};
        for (const key of memoSections)
          sections[key] = text(input.sections?.[key] ?? "", key, 50000);
        evidence(state, input.evidence, input);
        let record = input.id
          ? state.records.find(
              (r) => r.id === input.id && r.kind === input.kind,
            )
          : undefined;
        if (input.id && !record) fail("missing", "Research item not found.");
        if (record) {
          if (record.archived)
            fail("invalid", "Restore this item before editing.");
          if (
            record.companyId !== input.companyId ||
            record.dealId !== input.dealId
          )
            fail(
              "invalid",
              "An existing item's company and deal cannot change.",
            );
          if (record.revisions.at(-1)?.id !== input.expectedRevisionId)
            fail(
              "conflict",
              "A colleague saved a newer revision. Your text is preserved. Compare with the latest revision before saving again.",
            );
        } else {
          if (input.expectedRevisionId !== null)
            fail("conflict", "The new item cannot have an earlier revision.");
          record = {
            id: clock.id(),
            kind: input.kind,
            companyId: input.companyId,
            dealId: input.dealId,
            owner: actor.userId,
            archived: false,
            revisions: [],
            updatedAt: clock.now(),
          };
          state.records.push(record);
        }
        record.updatedAt = clock.now();
        record.revisions.push({
          id: clock.id(),
          title,
          body,
          sections,
          label: input.label,
          evidence: structuredClone(input.evidence),
          author: actor.userId,
          createdAt: clock.now(),
        });
        audit(state, actor, "research.revision.saved", record.id);
        return structuredClone(record);
      });
    },
    async reserve(actor: Actor, input: UploadInput) {
      edit(actor);
      return repository.transact(actor, (state) => {
        scope(state, input);
        const title = text(input.title, "Title", 200).trim();
        if (!title) fail("invalid", "Enter a document title.");
        if (!categories.includes(input.category))
          fail("invalid", "Choose a document category.");
        const description = text(input.description, "Description", 2000);
        const filename = text(input.filename, "Filename", 255);
        if (
          !/\.(pdf|docx)$/i.test(filename) ||
          Array.from(filename).some(
            (character) =>
              character.charCodeAt(0) < 32 ||
              character === "/" ||
              character === "\\",
          )
        )
          fail("invalid", "Choose a PDF or DOCX file with a valid filename.");
        if (
          !Number.isInteger(input.size) ||
          input.size < 1 ||
          input.size > 25 * 1024 * 1024
        )
          fail("invalid", "Files must be between 1 byte and 25 MB.");
        let document = input.documentId
          ? state.documents.find((d) => d.id === input.documentId)
          : undefined;
        if (input.documentId && !document)
          fail("missing", "Document not found.");
        if (
          document &&
          (document.companyId !== input.companyId ||
            document.dealId !== input.dealId ||
            document.archived)
        )
          fail(
            "invalid",
            "Choose an active document in this research context.",
          );
        if (!document) {
          document = {
            id: clock.id(),
            companyId: input.companyId,
            dealId: input.dealId,
            title,
            category: input.category,
            description,
            archived: false,
            versions: [],
            currentVersionId: null,
            updatedAt: clock.now(),
          };
          state.documents.push(document);
        }
        document.title = title;
        document.category = input.category;
        document.description = description;
        document.updatedAt = clock.now();
        const versionId = clock.id();
        document.versions.push({
          id: versionId,
          filename,
          size: input.size,
          mediaType: "application/octet-stream",
          checksum: null,
          state: "pending",
          message: "Waiting for upload and validation.",
          uploader: actor.userId,
          createdAt: clock.now(),
        });
        audit(state, actor, "document.upload.reserved", versionId);
        return { documentId: document.id, versionId };
      });
    },
    async upload(actor: Actor, versionId: string, bytes?: Uint8Array) {
      edit(actor);
      // Holding the firm transaction prevents completion, retry and archive from racing.
      return repository.transact(actor, async (state) => {
        const { document, version } = versionIn(state, versionId);
        if (version.state === "ready" || version.state === "rejected")
          return structuredClone(document);
        if (document.archived)
          fail("invalid", "Restore the document before retrying.");
        try {
          if (bytes) {
            if (bytes.byteLength !== version.size)
              fail(
                "invalid",
                "The uploaded size differs from the reserved file. Reserve a new upload.",
              );
            await storage.put(versionId, bytes);
          }
          const stored = await storage.get(versionId);
          if (stored.byteLength !== version.size)
            fail(
              "invalid",
              "The stored file is incomplete. Reserve a new upload.",
            );
          const inspected = await inspector.inspect(version.filename, stored);
          version.mediaType = inspected.mediaType;
          version.checksum = inspected.checksum;
          version.state = "ready";
          version.message = "Validated and scanned.";
          // Reservation order, not worker completion order, defines the latest version.
          document.currentVersionId =
            document.versions.findLast((v) => v.state === "ready")?.id ?? null;
          document.updatedAt = clock.now();
          audit(state, actor, "document.upload.ready", version.id);
        } catch (error) {
          const invalid =
            error instanceof ResearchError && error.code === "invalid";
          version.state = invalid ? "rejected" : "failed";
          version.message = invalid
            ? (error as ResearchError).message
            : "Validation or scanning is unavailable. Retry when the service recovers, or upload again if the transfer was interrupted.";
          audit(
            state,
            actor,
            invalid ? "document.upload.rejected" : "document.upload.failed",
            version.id,
          );
        }
        return structuredClone(document);
      });
    },
    async update(
      actor: Actor,
      id: string,
      input: {
        kind: "document" | "note" | "memo";
        archived?: boolean;
        title?: string;
        category?: string;
        description?: string;
      },
    ) {
      edit(actor);
      return repository.transact(actor, (state) => {
        const record =
          input.kind === "document"
            ? state.documents.find((d) => d.id === id)
            : state.records.find((r) => r.id === id && r.kind === input.kind);
        if (!record) fail("missing", "Research item not found.");
        if (input.archived !== undefined) {
          if (actor.role !== "admin")
            fail(
              "forbidden",
              "Administrator access is required to archive or restore research.",
            );
          if (typeof input.archived !== "boolean")
            fail("invalid", "Archive must be true or false.");
          record.archived = input.archived;
        }
        if ("versions" in record) {
          if (input.title !== undefined) {
            const title = text(input.title, "Title", 200).trim();
            if (!title) fail("invalid", "Enter a title.");
            record.title = title;
          }
          if (input.description !== undefined)
            record.description = text(input.description, "Description", 2000);
          if (input.category !== undefined) {
            if (
              !categories.includes(
                input.category as (typeof categories)[number],
              )
            )
              fail("invalid", "Choose a category.");
            record.category = input.category as (typeof categories)[number];
          }
        }
        record.updatedAt = clock.now();
        audit(state, actor, "research.metadata.updated", id);
        return {};
      });
    },
    async download(actor: Actor, versionId: string) {
      return repository.transact(actor, async (state) => {
        const { version } = versionIn(state, versionId);
        if (version.state !== "ready")
          fail(
            "forbidden",
            "This file has not passed validation and scanning.",
          );
        let bytes: Uint8Array;
        try {
          bytes = await storage.get(version.id);
        } catch {
          return fail(
            "unavailable",
            "The file is temporarily unavailable. Contact your administrator.",
          );
        }
        audit(state, actor, "document.download", version.id);
        return {
          bytes,
          filename: version.filename,
          mediaType: version.mediaType,
        };
      });
    },
    async reconcile(actor: Actor) {
      if (actor.role !== "admin")
        fail("forbidden", "Administrator access is required.");
      return repository.transact(actor, async (state) => {
        const cutoff = Date.parse(clock.now()) - 24 * 60 * 60 * 1000;
        for (const doc of state.documents)
          for (const version of doc.versions) {
            if (
              version.state === "pending" &&
              Date.parse(version.createdAt) < cutoff
            ) {
              version.state = "failed";
              version.message =
                "Upload was interrupted. Retry processing or upload the file again.";
              audit(state, actor, "document.upload.expired", version.id);
            }
          }
        return {};
      });
    },
  };
}
export type ResearchService = ReturnType<typeof createResearchService>;
