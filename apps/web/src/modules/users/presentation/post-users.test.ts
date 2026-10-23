import { describe, expect, it, vi } from "vitest";
import { DuplicateUserEmailError } from "../domain/errors";
import { createPostUsersHandler } from "./post-users";

const createdUser = (email: string) => ({
  id: "user-1",
  email,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

describe("createPostUsersHandler", () => {
  it("creates a user and returns 201", async () => {
    const handler = createPostUsersHandler({
      createUser: vi.fn(async ({ email }) => createdUser(email)),
      logError: vi.fn(),
    });

    const response = await handler(
      new Request("http://test/api/users", {
        method: "POST",
        body: JSON.stringify({ email: "ada@example.com" }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      email: "ada@example.com",
    });
  });

  it("trims whitespace around an email before validating the request", async () => {
    const createUser = vi.fn(async ({ email }: { email: string }) =>
      createdUser(email),
    );
    const handler = createPostUsersHandler({ createUser, logError: vi.fn() });

    const response = await handler(
      new Request("http://test/api/users", {
        method: "POST",
        body: JSON.stringify({ email: " Ada@Example.com " }),
      }),
    );

    expect(response.status).toBe(201);
    expect(createUser).toHaveBeenCalledWith({ email: "Ada@Example.com" });
    await expect(response.json()).resolves.toMatchObject({
      email: "Ada@Example.com",
    });
  });

  it("returns 400 for a malformed body without calling the use case", async () => {
    const createUser = vi.fn(async ({ email }: { email: string }) =>
      createdUser(email),
    );
    const handler = createPostUsersHandler({ createUser, logError: vi.fn() });

    const response = await handler(
      new Request("http://test/api/users", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rejects an email longer than the database index can store", async () => {
    const createUser = vi.fn(async ({ email }: { email: string }) =>
      createdUser(email),
    );
    const handler = createPostUsersHandler({ createUser, logError: vi.fn() });
    const email = `${"a".repeat(243)}@example.com`;

    const response = await handler(
      new Request("http://test/api/users", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    );

    expect(response.status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("returns 409 for a duplicate email", async () => {
    const handler = createPostUsersHandler({
      createUser: vi
        .fn()
        .mockRejectedValue(new DuplicateUserEmailError("ada@example.com")),
      logError: vi.fn(),
    });

    const response = await handler(
      new Request("http://test/api/users", {
        method: "POST",
        body: JSON.stringify({ email: "ada@example.com" }),
      }),
    );

    expect(response.status).toBe(409);
  });

  it("returns a generic 500 and logs an unexpected error", async () => {
    const databaseError = new Error("database unavailable");
    const logError = vi.fn();
    const handler = createPostUsersHandler({
      createUser: vi.fn().mockRejectedValue(databaseError),
      logError,
    });

    const response = await handler(
      new Request("http://test/api/users", {
        method: "POST",
        body: JSON.stringify({ email: "ada@example.com" }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
    expect(logError).toHaveBeenCalledWith(databaseError);
  });
});
