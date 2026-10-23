import { DuplicateUserEmailError } from "../domain/errors";
import type { UserRepository } from "../domain/user-repository";
import { database } from "./database";
import { users } from "./schema";

export function createDrizzleUserRepository(): UserRepository {
  return {
    async create({ email }) {
      try {
        const [user] = await database
          .insert(users)
          .values({ email })
          .returning();
        return user;
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505"
        ) {
          throw new DuplicateUserEmailError(email);
        }
        throw error;
      }
    },
  };
}
