import { z } from "zod";
import {
  ACTIVE_STAGES,
  type CompanyReference,
  type Deal,
  type DealEvent,
  isActiveStage,
  type PipelineContext,
  PipelineError,
  STAGES,
} from "../domain/pipeline";
import type {
  CompanyLookup,
  MutationTransaction,
  PipelineRepository,
} from "../domain/ports";

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(200);
const dueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Due date must be a valid calendar date")
  .nullable();
const fields = {
  companyId: uuid.nullable().optional().default(null),
  companyName: name.optional(),
  ownerId: uuid.optional(),
  nextStep: z.string().trim().max(500).optional().default(""),
  dueDate: dueDate.optional().default(null),
  summary: z.string().trim().max(10000).optional().default(""),
};
const createInput = z
  .object({
    ...fields,
    requestId: uuid,
    name: name.optional(),
    stage: z.enum(ACTIVE_STAGES).optional().default("inbox"),
  })
  .strict();
const updateInput = z
  .object({
    requestId: uuid,
    expectedVersion: z.number().int().positive(),
    name: name.optional(),
    companyId: uuid.nullable().optional(),
    companyName: name.optional(),
    ownerId: uuid.optional(),
    nextStep: z.string().trim().max(500).optional(),
    dueDate: dueDate.optional(),
    summary: z.string().trim().max(10000).optional(),
  })
  .strict()
  .refine(
    (input) =>
      Object.entries(input).some(
        ([key, value]) =>
          key !== "requestId" &&
          key !== "expectedVersion" &&
          value !== undefined,
      ),
    "At least one editable field is required",
  );
const transitionInput = z
  .object({
    requestId: uuid,
    expectedVersion: z.number().int().positive(),
    stage: z.enum(STAGES),
    rationale: z.string().trim().max(2000).optional().default(""),
    confirmed: z.boolean().optional().default(false),
  })
  .strict();
const filtersInput = z
  .object({
    q: z.string().trim().max(200).optional(),
    owner: uuid.optional(),
    stage: z.enum(STAGES).optional(),
    scope: z.enum(["active", "closed", "all"]).optional().default("active"),
  })
  .strict();
const companyReference = z.object({
  id: uuid,
  name,
  href: z
    .string()
    .refine(
      (href) =>
        href.startsWith("/") &&
        !href.startsWith("//") &&
        !href.includes("\\") &&
        ![...href].some(
          (character) =>
            character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
        ),
      "Company link must be a safe relative path",
    ),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new PipelineError(
      "invalid",
      result.error.issues
        .map((issue) => `${issue.path.join(".") || "Input"}: ${issue.message}`)
        .join("; "),
    );
  }
  return result.data;
}

async function currentDeal(
  tx: MutationTransaction,
  context: PipelineContext,
  id: string,
  version: number,
) {
  const deal = await tx.getDeal(id);
  if (!deal || deal.firmId !== context.firmId)
    throw new PipelineError("not_found", "Deal not found");
  if (deal.version !== version)
    throw new PipelineError(
      "conflict",
      "This deal has changed. Refresh it before saving.",
    );
  return deal;
}

async function requireOwner(tx: MutationTransaction, ownerId: string) {
  if (!(await tx.ownerExists(ownerId)))
    throw new PipelineError("invalid", "Owner must be a member of your firm");
}

function event(
  context: PipelineContext,
  deal: Deal,
  kind: DealEvent["kind"],
  fromStage: DealEvent["fromStage"],
  changes: DealEvent["changes"],
  rationale = "",
): DealEvent {
  return {
    id: crypto.randomUUID(),
    dealId: deal.id,
    actorId: context.memberId,
    occurredAt: deal.updatedAt,
    kind,
    fromStage,
    toStage: deal.stage,
    changes,
    rationale,
  };
}

export function createPipelineService(
  repository: PipelineRepository,
  companyLookup: CompanyLookup,
) {
  async function company(
    context: PipelineContext,
    input: { companyId: string | null; companyName?: string },
  ) {
    if (!input.companyId) {
      if (!input.companyName)
        throw new PipelineError("invalid", "Company name is required");
      return {
        companyId: null,
        companyName: input.companyName,
        companyHref: null,
      };
    }
    const reference = await companyLookup.resolve(context, input.companyId);
    if (!reference) throw new PipelineError("not_found", "Company not found");
    const resolved = parse(companyReference, reference);
    if (resolved.id !== input.companyId)
      throw new PipelineError(
        "invalid",
        "Company reference does not match the selected company",
      );
    return {
      companyId: resolved.id,
      companyName: resolved.name,
      companyHref: resolved.href,
    };
  }

  return {
    async list(context: PipelineContext, input: unknown = {}) {
      return repository.list(context, parse(filtersInput, input));
    },
    async detail(context: PipelineContext, id: string) {
      const detail = await repository.detail(context, parse(uuid, id));
      if (!detail || detail.deal.firmId !== context.firmId)
        throw new PipelineError("not_found", "Deal not found");
      return detail;
    },
    async members(context: PipelineContext) {
      return repository.members(context);
    },
    async companies(
      context: PipelineContext,
      query: unknown = "",
    ): Promise<CompanyReference[]> {
      const q = parse(z.string().trim().max(200), query);
      const references = await companyLookup.search(context, q);
      return references.map((reference) => parse(companyReference, reference));
    },
    async create(context: PipelineContext, input: unknown): Promise<Deal> {
      const data = parse(createInput, input);
      return repository.mutate(
        context,
        data.requestId,
        JSON.stringify({ operation: "create", input: data }),
        async (tx) => {
          const ownerId = data.ownerId ?? context.memberId;
          await requireOwner(tx, ownerId);
          const reference = await company(context, data);
          const now = new Date().toISOString();
          const deal: Deal = {
            id: crypto.randomUUID(),
            firmId: context.firmId,
            name: data.name ?? reference.companyName,
            ...reference,
            stage: data.stage,
            ownerId,
            nextStep: data.nextStep,
            dueDate: data.dueDate,
            summary: data.summary,
            createdBy: context.memberId,
            createdAt: now,
            updatedAt: now,
            stageEnteredAt: now,
            version: 1,
          };
          await tx.insertDeal(deal);
          const changes: DealEvent["changes"] = {};
          for (const key of [
            "name",
            "companyId",
            "companyName",
            "companyHref",
            "stage",
            "ownerId",
            "nextStep",
            "dueDate",
            "summary",
          ] as const) {
            changes[key] = { before: null, after: deal[key] };
          }
          await tx.appendEvent(event(context, deal, "created", null, changes));
          return deal;
        },
      );
    },
    async update(
      context: PipelineContext,
      id: string,
      input: unknown,
    ): Promise<Deal> {
      const dealId = parse(uuid, id);
      const data = parse(updateInput, input);
      return repository.mutate(
        context,
        data.requestId,
        JSON.stringify({ operation: "update", id: dealId, input: data }),
        async (tx) => {
          const before = await currentDeal(
            tx,
            context,
            dealId,
            data.expectedVersion,
          );
          if (data.ownerId !== undefined && data.ownerId !== before.ownerId)
            await requireOwner(tx, data.ownerId);
          let reference = {
            companyId: before.companyId,
            companyName: before.companyName,
            companyHref: before.companyHref,
          };
          if (data.companyId !== undefined || data.companyName !== undefined) {
            const companyId =
              data.companyId === undefined ? before.companyId : data.companyId;
            if (companyId && companyId === before.companyId) {
              const existing = parse(companyReference, {
                id: companyId,
                name: before.companyName,
                href: before.companyHref,
              });
              reference = {
                companyId: existing.id,
                companyName: existing.name,
                companyHref: existing.href,
              };
            } else {
              reference = await company(context, {
                companyId,
                companyName: data.companyName ?? before.companyName,
              });
            }
          }
          const values = {
            name: data.name ?? before.name,
            ...reference,
            ownerId: data.ownerId ?? before.ownerId,
            nextStep: data.nextStep ?? before.nextStep,
            dueDate: data.dueDate === undefined ? before.dueDate : data.dueDate,
            summary: data.summary ?? before.summary,
          };
          const changes: DealEvent["changes"] = {};
          for (const key of Object.keys(values) as (keyof typeof values)[]) {
            if (before[key] !== values[key])
              changes[key] = { before: before[key], after: values[key] };
          }
          if (Object.keys(changes).length === 0) return before;
          const deal: Deal = {
            ...before,
            ...values,
            version: before.version + 1,
            updatedAt: new Date().toISOString(),
          };
          await tx.saveDeal(deal, data.expectedVersion);
          await tx.appendEvent(
            event(context, deal, "updated", before.stage, changes),
          );
          return deal;
        },
      );
    },
    async transition(
      context: PipelineContext,
      id: string,
      input: unknown,
    ): Promise<Deal> {
      const dealId = parse(uuid, id);
      const data = parse(transitionInput, input);
      return repository.mutate(
        context,
        data.requestId,
        JSON.stringify({ operation: "transition", id: dealId, input: data }),
        async (tx) => {
          const before = await currentDeal(
            tx,
            context,
            dealId,
            data.expectedVersion,
          );
          if (before.stage === data.stage) return before;
          const wasActive = isActiveStage(before.stage);
          const willBeActive = isActiveStage(data.stage);
          if (!wasActive && !willBeActive)
            throw new PipelineError(
              "invalid",
              "Reopen the deal before changing its outcome",
            );
          if (wasActive && !willBeActive && !data.confirmed)
            throw new PipelineError(
              "invalid",
              "Confirm the outcome before closing the deal",
            );
          const now = new Date().toISOString();
          const deal: Deal = {
            ...before,
            stage: data.stage,
            version: before.version + 1,
            updatedAt: now,
            stageEnteredAt: now,
          };
          await tx.saveDeal(deal, data.expectedVersion);
          await tx.appendEvent(
            event(
              context,
              deal,
              !wasActive ? "reopened" : !willBeActive ? "closed" : "moved",
              before.stage,
              { stage: { before: before.stage, after: data.stage } },
              data.rationale,
            ),
          );
          return deal;
        },
      );
    },
  };
}
