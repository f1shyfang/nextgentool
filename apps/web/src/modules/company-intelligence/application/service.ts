import { z } from "zod";
import {
  normalizeDomain,
  normalizeName,
  resolveFields,
} from "../domain/policy";
import {
  type Actor,
  type Clock,
  type Company,
  CompanyError,
  type CompanyRepository,
  type CompanyTransaction,
  type FactValue,
  fields,
  type Profile,
} from "../domain/types";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const bounded = z.string().trim().min(1).max(2000);
const reason = z.string().trim().min(1).max(1000);
const writeBase = {
  requestId: uuid,
  expectedVersion: z.number().int().positive(),
};
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new CompanyError(
      "invalid",
      result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    );
  return result.data;
}
function writer(actor: Actor) {
  if (actor.role !== "contributor" && actor.role !== "admin")
    throw new CompanyError("forbidden", "Contributor membership is required");
}
function publicSource(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !host.includes(".") ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.includes(":") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host)
    )
      return false;
    return true;
  } catch {
    return false;
  }
}
export function createCompanyService({
  repository,
  clock,
}: {
  repository: CompanyRepository;
  clock: Clock;
}) {
  async function get(tx: CompanyTransaction, id: string) {
    const company = await tx.getCompany(id);
    if (!company) throw new CompanyError("not_found", "Company not found");
    return company;
  }
  async function build(
    tx: CompanyTransaction,
    companyId: string,
  ): Promise<Profile> {
    const company = await get(tx, companyId);
    const assertions = await tx.assertions(companyId);
    const overrides = await tx.overrides(companyId);
    return {
      company,
      assertions,
      overrides,
      fields: resolveFields(assertions, overrides),
    };
  }
  async function audit(
    tx: CompanyTransaction,
    actor: Actor,
    companyId: string,
    action: string,
    detail: Record<string, unknown>,
  ) {
    await tx.appendAudit({
      id: clock.id(),
      firmId: actor.firmId,
      companyId,
      actorId: actor.userId,
      action,
      detail,
      createdAt: clock.now(),
    });
  }
  function mutation<T extends { requestId: string; expectedVersion: number }>(
    actor: Actor,
    companyId: string,
    input: T,
    action: string,
    operation: (tx: CompanyTransaction) => Promise<void>,
  ): Promise<Profile> {
    writer(actor);
    companyId = parse(uuid, companyId);
    return repository.write(
      actor,
      input.requestId,
      JSON.stringify({ action, companyId, ...input }),
      async (tx) => {
        const company = await get(tx, companyId);
        if (company.version !== input.expectedVersion)
          throw new CompanyError("conflict", "Company version has changed");
        await operation(tx);
        await tx.bumpVersion(companyId, input.expectedVersion, clock.now());
        return build(tx, companyId);
      },
    );
  }
  return {
    async companyCandidates(actor: Actor, raw: unknown) {
      const input = parse(
        z
          .object({
            name: z.string().trim().min(1).max(200),
            domain: z.string().trim().min(1).max(253).nullable().optional(),
          })
          .strict(),
        raw,
      );
      const name = normalizeName(input.name);
      const domain = input.domain ? normalizeDomain(input.domain) : null;
      return repository.read(actor, async (tx) => ({
        companies: await tx.candidates(name, domain),
      }));
    },
    async createCompany(actor: Actor, raw: unknown): Promise<Company> {
      writer(actor);
      const input = parse(
        z
          .object({
            requestId: uuid,
            name: z.string().trim().min(1).max(200),
            domain: z.string().trim().min(1).max(253).nullable().optional(),
            duplicateReason: reason.optional(),
          })
          .strict(),
        raw,
      );
      const name = normalizeName(input.name);
      const domain = input.domain ? normalizeDomain(input.domain) : null;
      return repository.write(
        actor,
        input.requestId,
        JSON.stringify({
          action: "createCompany",
          name,
          domain,
          duplicateReason: input.duplicateReason,
        }),
        async (tx) => {
          if (
            (await tx.candidates(name, domain)).length &&
            !input.duplicateReason
          )
            throw new CompanyError(
              "conflict",
              "A matching company exists; provide a duplicate reason to create a distinct company",
            );
          const now = clock.now();
          const company: Company = {
            id: clock.id(),
            firmId: actor.firmId,
            name,
            domain,
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
          await tx.insertCompany(company);
          await audit(tx, actor, company.id, "company.created", {
            name,
            domain,
            duplicateReason: input.duplicateReason ?? null,
          });
          return company;
        },
      );
    },
    async listCompanies(actor: Actor, raw: unknown = {}) {
      const input = parse(
        z
          .object({
            q: z.string().trim().max(200).default(""),
            limit: z.number().int().min(1).max(100).default(25),
            after: uuid.nullable().default(null),
          })
          .strict(),
        raw,
      );
      return repository.read(actor, async (tx) => {
        const companies = await tx.listCompanies({
          ...input,
          limit: input.limit + 1,
        });
        const page = companies.slice(0, input.limit);
        return {
          companies: page,
          nextCursor:
            companies.length > input.limit ? page[page.length - 1].id : null,
        };
      });
    },
    async profile(actor: Actor, companyId: string) {
      companyId = parse(uuid, companyId);
      return repository.read(actor, (tx) => build(tx, companyId));
    },
    async addAssertion(actor: Actor, companyId: string, raw: unknown) {
      writer(actor);
      companyId = parse(uuid, companyId);
      const input = parse(
        z
          .object({
            ...writeBase,
            field: z.enum(fields),
            value: z.unknown(),
            sourceUrl: z
              .string()
              .max(2048)
              .refine(
                publicSource,
                "A public HTTP or HTTPS reference URL without credentials is required",
              ),
            sourceTitle: z.string().trim().min(1).max(300),
            observedAt: z.iso.datetime({ offset: true }),
            claimKind: z.enum(["reported", "estimated", "manual"]),
          })
          .strict(),
        raw,
      );
      if (Date.parse(input.observedAt) > Date.parse(clock.now()))
        throw new CompanyError(
          "invalid",
          "Observation date cannot be in the future",
        );
      const valueSchema: z.ZodType<FactValue> =
        input.field === "foundingYear"
          ? z
              .number()
              .int()
              .min(1000)
              .max(new Date(clock.now()).getUTCFullYear())
          : input.field === "sector" || input.field === "operatingMarkets"
            ? z.array(z.string().trim().min(1).max(100)).min(1).max(100)
            : bounded;
      const value = parse(valueSchema, input.value);
      const canonical = {
        ...input,
        value,
        observedAt: new Date(input.observedAt).toISOString(),
      };
      return mutation(
        actor,
        companyId,
        canonical,
        "addAssertion",
        async (tx) => {
          const id = clock.id();
          await tx.insertAssertion({
            ...canonical,
            id,
            firmId: actor.firmId,
            companyId,
            reviewStatus: "unreviewed",
            superseded: false,
            createdBy: actor.userId,
            createdAt: clock.now(),
          });
          await audit(tx, actor, companyId, "assertion.added", {
            assertionId: id,
            field: input.field,
            sourceUrl: input.sourceUrl,
          });
        },
      );
    },
    async reviewAssertion(
      actor: Actor,
      companyId: string,
      assertionId: string,
      raw: unknown,
    ) {
      writer(actor);
      companyId = parse(uuid, companyId);
      assertionId = parse(uuid, assertionId);
      const input = parse(
        z
          .object({
            ...writeBase,
            reviewStatus: z.enum([
              "unreviewed",
              "verified",
              "disputed",
              "rejected",
            ]),
            reason,
          })
          .strict(),
        raw,
      );
      return mutation(
        actor,
        companyId,
        { ...input, assertionId },
        "reviewAssertion",
        async (tx) => {
          const assertion = (await tx.assertions(companyId)).find(
            (a) => a.id === assertionId,
          );
          if (!assertion)
            throw new CompanyError("not_found", "Assertion not found");
          const previousStatus = assertion.reviewStatus;
          await tx.reviewAssertion(assertionId, companyId, input.reviewStatus);
          await audit(tx, actor, companyId, "assertion.reviewed", {
            assertionId,
            previousStatus,
            status: input.reviewStatus,
            reason: input.reason,
          });
        },
      );
    },
    async setOverride(actor: Actor, companyId: string, raw: unknown) {
      writer(actor);
      companyId = parse(uuid, companyId);
      const input = parse(
        z
          .object({
            ...writeBase,
            field: z.enum(fields),
            assertionId: uuid,
            reason,
          })
          .strict(),
        raw,
      );
      return mutation(actor, companyId, input, "setOverride", async (tx) => {
        const assertion = (await tx.assertions(companyId)).find(
          (a) => a.id === input.assertionId && a.field === input.field,
        );
        if (!assertion)
          throw new CompanyError(
            "not_found",
            "Assertion not found for this company and field",
          );
        if (
          assertion.superseded ||
          assertion.reviewStatus === "disputed" ||
          assertion.reviewStatus === "rejected"
        )
          throw new CompanyError(
            "conflict",
            "Only eligible assertions can be pinned",
          );
        await tx.releaseOverrides(companyId, input.field);
        const id = clock.id();
        await tx.insertOverride({
          id,
          firmId: actor.firmId,
          companyId,
          field: input.field,
          assertionId: input.assertionId,
          active: true,
          reason: input.reason,
          createdBy: actor.userId,
          createdAt: clock.now(),
        });
        await audit(tx, actor, companyId, "override.set", {
          overrideId: id,
          assertionId: input.assertionId,
          reason: input.reason,
        });
      });
    },
    async releaseOverride(
      actor: Actor,
      companyId: string,
      overrideId: string,
      raw: unknown,
    ) {
      writer(actor);
      companyId = parse(uuid, companyId);
      overrideId = parse(uuid, overrideId);
      const input = parse(z.object({ ...writeBase, reason }).strict(), raw);
      return mutation(
        actor,
        companyId,
        { ...input, overrideId },
        "releaseOverride",
        async (tx) => {
          const override = (await tx.overrides(companyId)).find(
            (o) => o.id === overrideId,
          );
          if (!override)
            throw new CompanyError("not_found", "Override not found");
          if (!override.active)
            throw new CompanyError(
              "conflict",
              "Override has already been released",
            );
          await tx.releaseOverrides(companyId, override.field);
          await audit(tx, actor, companyId, "override.released", {
            overrideId,
            reason: input.reason,
          });
        },
      );
    },
  };
}
