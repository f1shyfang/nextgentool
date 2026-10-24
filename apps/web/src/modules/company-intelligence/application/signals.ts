import { z } from "zod";
import {
  dateBounds,
  duplicateKey,
  financingFiltersSchema,
  materialChange,
  signalPayloadSchema,
} from "../domain/signal-policy";
import type {
  FinancingRow,
  SignalDependencies,
  SignalPayload,
  SignalRevision,
  SignalTransaction,
  SignalWorkspace,
} from "../domain/signal-types";
import { type Actor, CompanyError } from "../domain/types";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const reason = z.string().trim().min(1).max(1000);
const createSchema = z
  .object({
    requestId: uuid,
    expectedCompanyVersion: z.number().int().positive(),
    payload: signalPayloadSchema,
    duplicateReason: reason.optional(),
  })
  .strict();
const correctionSchema = createSchema
  .extend({ expectedSignalVersion: z.number().int().positive(), reason })
  .strict();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new CompanyError(
      "invalid",
      result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  return result.data;
}
function writer(actor: Actor) {
  if (actor.role !== "contributor" && actor.role !== "admin")
    throw new CompanyError("forbidden", "Contributor membership is required");
}
export function createManualSignalsService({
  repository,
  clock,
}: SignalDependencies) {
  async function getCompany(tx: SignalTransaction, companyId: string) {
    const company = await tx.getCompany(companyId);
    if (!company) throw new CompanyError("not_found", "Company not found");
    return company;
  }
  async function workspace(
    tx: SignalTransaction,
    companyId: string,
  ): Promise<SignalWorkspace> {
    const company = await getCompany(tx, companyId);
    const signals = await tx.listSignals(companyId);
    return {
      companyVersion: company.version,
      companyUpdatedAt: company.updatedAt,
      signals: signals.map((detail) => ({
        ...detail,
        revisions: [...detail.revisions].sort(
          (a, b) => a.revision - b.revision,
        ),
      })),
    };
  }
  function validateObservation(payload: SignalPayload) {
    if (
      payload.sources.some(
        (source) => Date.parse(source.observedAt) > Date.parse(clock.now()),
      )
    )
      throw new CompanyError(
        "invalid",
        "Observation date cannot be in the future",
      );
  }
  async function projection(tx: SignalTransaction, revision: SignalRevision) {
    const { payload } = revision;
    let row: FinancingRow | null = null;
    if (
      payload.financing &&
      (payload.status === "unreviewed" || payload.status === "verified")
    )
      row = {
        firmId: revision.firmId,
        companyId: revision.companyId,
        signalId: revision.signalId,
        revisionId: revision.id,
        title: payload.title,
        ...payload.financing,
        ...dateBounds(payload.eventDate),
        eventDate: payload.eventDate,
        status: payload.status,
        createdAt: revision.createdAt,
      };
    await tx.replaceFinancing(revision.companyId, revision.signalId, row);
  }
  async function audit(
    tx: SignalTransaction,
    actor: Actor,
    revision: SignalRevision,
    previous: SignalRevision | null,
    duplicateReason?: string,
  ) {
    await tx.appendAudit({
      id: clock.id().toLowerCase(),
      firmId: actor.firmId,
      companyId: revision.companyId,
      actorId: actor.userId,
      action: previous ? "signal.corrected" : "signal.created",
      detail: {
        signalId: revision.signalId,
        revisionId: revision.id,
        revision: revision.revision,
        previousRevisionId: previous?.id ?? null,
        previousRevision: previous?.revision ?? null,
        previousStatus: previous?.payload.status ?? null,
        status: revision.payload.status,
        material: revision.material,
        reason: revision.reason,
        duplicateReason: duplicateReason ?? null,
      },
      createdAt: revision.createdAt,
    });
  }
  async function assertDuplicate(
    tx: SignalTransaction,
    companyId: string,
    payload: SignalPayload,
    duplicateReason?: string,
    signalId?: string,
  ) {
    const key = duplicateKey(payload);
    if ((await tx.findDuplicate(companyId, key, signalId)) && !duplicateReason)
      throw new CompanyError(
        "conflict",
        "A matching signal exists; provide a duplicate reason to record a distinct event",
      );
    return key;
  }
  return {
    async workspace(actor: Actor, companyId: string): Promise<SignalWorkspace> {
      companyId = parse(uuid, companyId);
      return repository.read(actor, (tx) => workspace(tx, companyId));
    },
    async financingHistory(
      actor: Actor,
      companyId: string,
      rawFilters: unknown = {},
    ): Promise<{ rounds: FinancingRow[] }> {
      companyId = parse(uuid, companyId);
      const filters = parse(financingFiltersSchema, rawFilters);
      return repository.read(actor, async (tx) => {
        await getCompany(tx, companyId);
        return { rounds: await tx.financingHistory(companyId, filters) };
      });
    },
    async createSignal(
      actor: Actor,
      companyId: string,
      raw: unknown,
    ): Promise<SignalWorkspace> {
      writer(actor);
      companyId = parse(uuid, companyId);
      const input = parse(createSchema, raw);
      validateObservation(input.payload);
      return repository.write(
        actor,
        input.requestId,
        JSON.stringify({ action: "createSignal", companyId, ...input }),
        async (tx) => {
          const company = await getCompany(tx, companyId);
          if (company.version !== input.expectedCompanyVersion)
            throw new CompanyError("conflict", "Company version has changed");
          const key = await assertDuplicate(
            tx,
            companyId,
            input.payload,
            input.duplicateReason,
          );
          const now = clock.now();
          const signalId = clock.id().toLowerCase();
          await tx.insertSignal({
            id: signalId,
            firmId: actor.firmId,
            companyId,
            version: 1,
            duplicateKey: key,
            createdBy: actor.userId,
            createdAt: now,
            updatedAt: now,
          });
          const revision: SignalRevision = {
            id: clock.id().toLowerCase(),
            firmId: actor.firmId,
            companyId,
            signalId,
            revision: 1,
            payload: input.payload,
            material: true,
            reason: "Initial manual signal",
            createdBy: actor.userId,
            createdAt: now,
          };
          await tx.appendRevision(revision);
          await projection(tx, revision);
          await audit(tx, actor, revision, null, input.duplicateReason);
          await tx.bumpVersion(companyId, input.expectedCompanyVersion, now);
          return workspace(tx, companyId);
        },
      );
    },
    async correctSignal(
      actor: Actor,
      companyId: string,
      signalId: string,
      raw: unknown,
    ): Promise<SignalWorkspace> {
      writer(actor);
      companyId = parse(uuid, companyId);
      signalId = parse(uuid, signalId);
      const input = parse(correctionSchema, raw);
      validateObservation(input.payload);
      return repository.write(
        actor,
        input.requestId,
        JSON.stringify({
          action: "correctSignal",
          companyId,
          signalId,
          ...input,
        }),
        async (tx) => {
          const company = await getCompany(tx, companyId);
          if (company.version !== input.expectedCompanyVersion)
            throw new CompanyError("conflict", "Company version has changed");
          const detail = await tx.getSignal(companyId, signalId);
          if (!detail) throw new CompanyError("not_found", "Signal not found");
          if (detail.signal.version !== input.expectedSignalVersion)
            throw new CompanyError("conflict", "Signal version has changed");
          const previous = [...detail.revisions].sort(
            (a, b) => b.revision - a.revision,
          )[0];
          if (!previous)
            throw new CompanyError(
              "conflict",
              "Signal revision history is unavailable",
            );
          const key = await assertDuplicate(
            tx,
            companyId,
            input.payload,
            input.duplicateReason,
            signalId,
          );
          const now = clock.now();
          const revision: SignalRevision = {
            id: clock.id().toLowerCase(),
            firmId: actor.firmId,
            companyId,
            signalId,
            revision: detail.signal.version + 1,
            payload: input.payload,
            material: materialChange(previous.payload, input.payload),
            reason: input.reason,
            createdBy: actor.userId,
            createdAt: now,
          };
          await tx.saveSignal(
            {
              ...detail.signal,
              duplicateKey: key,
              version: revision.revision,
              updatedAt: now,
            },
            input.expectedSignalVersion,
          );
          await tx.appendRevision(revision);
          await projection(tx, revision);
          await audit(tx, actor, revision, previous, input.duplicateReason);
          await tx.bumpVersion(companyId, input.expectedCompanyVersion, now);
          return workspace(tx, companyId);
        },
      );
    },
  };
}
