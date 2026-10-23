import {
  type CreateUserInput,
  type CreateUserResult,
  createUser,
} from "@/modules/users/application/create-user";
import { createDrizzleUserRepository } from "@/modules/users/infrastructure/drizzle-user-repository";

export function createUsersCompositionRoot(): {
  createUser: (input: CreateUserInput) => Promise<CreateUserResult>;
} {
  const userRepository = createDrizzleUserRepository();
  return {
    createUser: (input) => createUser(input, { userRepository }),
  };
}
