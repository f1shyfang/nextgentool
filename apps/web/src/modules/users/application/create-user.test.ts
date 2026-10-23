import { describe, expect, it } from "vitest";
import { DuplicateUserEmailError } from "../domain/errors";
import type { User } from "../domain/user";
import type { UserRepository } from "../domain/user-repository";
import { createUser } from "./create-user";

const createdAt = new Date("2026-01-01T00:00:00.000Z");

const inMemoryRepository: UserRepository = {
  async create(input) {
    return {
      id: "user-1",
      email: input.email,
      createdAt,
      updatedAt: createdAt,
    } satisfies User;
  },
};

const duplicateRepository = {
  userRepository: {
    async create() {
      throw new DuplicateUserEmailError("ada@example.com");
    },
  },
};

describe("createUser", () => {
  it("normalizes email and persists a new user", async () => {
    const result = await createUser(
      { email: "  Ada@Example.com " },
      { userRepository: inMemoryRepository },
    );

    expect(result.email).toBe("ada@example.com");
  });

  it("preserves a duplicate-email domain error", async () => {
    await expect(
      createUser({ email: "ada@example.com" }, duplicateRepository),
    ).rejects.toBeInstanceOf(DuplicateUserEmailError);
  });
});
