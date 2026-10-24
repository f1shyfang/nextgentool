import { and, eq } from "drizzle-orm";
import type { createCompanyService } from "../../company-intelligence/application/service";
import {
  type Actor,
  CompanyError,
} from "../../company-intelligence/domain/types";
import { researchMemberships } from "../../research-and-diligence/infrastructure/schema";
import { database } from "../../users/infrastructure/database";
import { type PipelineContext, PipelineError } from "../domain/pipeline";
import type { CompanyLookup } from "../domain/ports";
import { pipelineFirms, pipelineMembers } from "./schema";

type CompanyReader = Pick<
  ReturnType<typeof createCompanyService>,
  "listCompanies" | "profile"
>;

export function createCompanyIntelligenceLookup(
  service: CompanyReader,
): CompanyLookup {
  async function actorFor(context: PipelineContext): Promise<Actor> {
    const [membership] = await database
      .select({
        userId: researchMemberships.userId,
        firmId: researchMemberships.firmId,
        role: researchMemberships.role,
      })
      .from(pipelineMembers)
      .innerJoin(pipelineFirms, eq(pipelineMembers.firmId, pipelineFirms.id))
      .innerJoin(
        researchMemberships,
        and(
          eq(researchMemberships.userId, pipelineMembers.clerkUserId),
          eq(researchMemberships.firmId, pipelineFirms.researchFirmId),
        ),
      )
      .where(
        and(
          eq(pipelineMembers.id, context.memberId),
          eq(pipelineMembers.firmId, context.firmId),
          eq(pipelineMembers.enabled, true),
        ),
      )
      .limit(1);
    if (!membership)
      throw new PipelineError(
        "forbidden",
        "Company profiles require membership in the Company Intelligence firm connected to this pipeline.",
      );
    return membership;
  }
  async function read<T>(
    context: PipelineContext,
    operation: (actor: Actor) => Promise<T>,
  ): Promise<T> {
    try {
      return await operation(await actorFor(context));
    } catch (error) {
      if (
        error instanceof CompanyError &&
        (error.code === "forbidden" ||
          error.code === "not_found" ||
          error.code === "invalid")
      ) {
        throw new PipelineError(error.code, error.message);
      }
      throw error;
    }
  }
  return {
    search(context, query) {
      return read(context, async (actor) => {
        const { companies } = await service.listCompanies(actor, {
          q: query,
          limit: 25,
        });
        return companies.map((company) => ({
          id: company.id,
          name: company.name,
          href: `/companies/${company.id}/`,
        }));
      });
    },
    resolve(context, id) {
      return read(context, async (actor) => {
        try {
          const { company } = await service.profile(actor, id);
          return {
            id: company.id,
            name: company.name,
            href: `/companies/${company.id}/`,
          };
        } catch (error) {
          if (error instanceof CompanyError && error.code === "not_found")
            return null;
          throw error;
        }
      });
    },
  };
}
