import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { env } from "@repo/env/server";
import { createResearchService } from "@/modules/research-and-diligence/application/service";
import { ResearchError } from "@/modules/research-and-diligence/domain/types";
import {
  createFileInspector,
  createPrivateStorage,
} from "@/modules/research-and-diligence/infrastructure/files";
import { createResearchRepository } from "@/modules/research-and-diligence/infrastructure/repository";

let resources: ReturnType<typeof build> | undefined;
function build() {
  const repository = createResearchRepository(env.DATABASE_URL);
  const service = createResearchService({
    repository,
    storage: createPrivateStorage(env.RESEARCH_STORAGE_PATH),
    inspector: createFileInspector({
      clamavHost: env.CLAMAV_HOST,
      clamavPort: env.CLAMAV_PORT,
    }),
    clock: { now: () => new Date().toISOString(), id: randomUUID },
  });
  return { repository, service };
}
export function researchResources() {
  resources ??= build();
  return resources;
}
export async function researchActor() {
  if (!env.CLERK_SECRET_KEY)
    throw new ResearchError(
      "unavailable",
      "Configure Clerk before accessing private research.",
    );
  const { userId } = await auth();
  if (!userId)
    throw new ResearchError("forbidden", "Sign in to access research.");
  const actor = await researchResources().repository.actorFor(userId);
  if (!actor)
    throw new ResearchError(
      "forbidden",
      "Your account has no firm membership. Ask an administrator to grant access.",
    );
  return actor;
}
