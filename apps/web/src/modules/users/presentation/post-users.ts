import { z } from "zod";
import type {
  CreateUserInput,
  CreateUserResult,
} from "../application/create-user";
import { DuplicateUserEmailError } from "../domain/errors";

const createUserRequestSchema = z.object({
  email: z.string().trim().email().max(254),
});

export function createPostUsersHandler(dependencies: {
  createUser: (input: CreateUserInput) => Promise<CreateUserResult>;
  logError: (error: unknown) => void;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    const parsed = createUserRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    try {
      const user = await dependencies.createUser(parsed.data);
      return Response.json(user, { status: 201 });
    } catch (error) {
      if (error instanceof DuplicateUserEmailError) {
        return Response.json({ error: error.message }, { status: 409 });
      }

      dependencies.logError(error);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
