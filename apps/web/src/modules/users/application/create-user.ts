import type { User } from "../domain/user";
import type { UserRepository } from "../domain/user-repository";

export type CreateUserInput = {
  email: string;
};

export type CreateUserResult = User;

export async function createUser(
  input: CreateUserInput,
  dependencies: { userRepository: UserRepository },
): Promise<CreateUserResult> {
  return dependencies.userRepository.create({
    email: input.email.trim().toLowerCase(),
  });
}
