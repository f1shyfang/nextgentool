import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { env } from "@repo/env/server";
import { createCompanyService } from "@/modules/company-intelligence/application/service";
import { createManualSignalsService } from "@/modules/company-intelligence/application/signals";
import { CompanyError } from "@/modules/company-intelligence/domain/types";
import { createCompanyRepository } from "@/modules/company-intelligence/infrastructure/repository";

let resources: ReturnType<typeof build> | undefined;
function build() {
  const repository = createCompanyRepository(env.DATABASE_URL);
  return {
    repository,
    signalsService: createManualSignalsService({
      repository: repository.signals,
      clock: { id: randomUUID, now: () => new Date().toISOString() },
    }),
    service: createCompanyService({
      repository,
      clock: { id: randomUUID, now: () => new Date().toISOString() },
    }),
  };
}
export function companyResources() {
  resources ??= build();
  return resources;
}
export async function companySession() {
  if (!env.CLERK_SECRET_KEY)
    throw new CompanyError(
      "unavailable",
      "Configure authentication before accessing company research.",
    );
  const { userId } = await auth();
  if (!userId)
    throw new CompanyError(
      "unauthenticated",
      "Sign in to access company research.",
    );
  const { repository, service, signalsService } = companyResources();
  const actor = await repository.actorFor(userId);
  if (!actor)
    throw new CompanyError(
      "forbidden",
      "Ask your firm administrator for research membership.",
    );
  return { actor, service, signalsService };
}
