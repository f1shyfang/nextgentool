import { companyResources } from "@/lib/company-intelligence";
import { createPipelineService } from "@/modules/deal-pipeline/application/service";
import { createCompanyIntelligenceLookup } from "@/modules/deal-pipeline/infrastructure/company-lookup";
import { createDrizzlePipelineRepository } from "@/modules/deal-pipeline/infrastructure/drizzle-pipeline-repository";
import {
  type CreateUserInput,
  type CreateUserResult,
  createUser,
} from "@/modules/users/application/create-user";
import { createDrizzleUserRepository } from "@/modules/users/infrastructure/drizzle-user-repository";

export function createDealPipelineCompositionRoot() {
  const repository = createDrizzlePipelineRepository();
  return {
    repository,
    service: createPipelineService(
      repository,
      createCompanyIntelligenceLookup(companyResources().service),
    ),
  };
}

export function createUsersCompositionRoot(): {
  createUser: (input: CreateUserInput) => Promise<CreateUserResult>;
} {
  const userRepository = createDrizzleUserRepository();
  return {
    createUser: (input) => createUser(input, { userRepository }),
  };
}
