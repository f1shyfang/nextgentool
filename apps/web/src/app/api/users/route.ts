import { createUsersCompositionRoot } from "@/lib/composition-root";
import { createPostUsersHandler } from "@/modules/users/presentation/post-users";

export const runtime = "nodejs";

const { createUser } = createUsersCompositionRoot();

export const POST = createPostUsersHandler({
  createUser,
  logError: (error) => console.error("Failed to create user", error),
});
