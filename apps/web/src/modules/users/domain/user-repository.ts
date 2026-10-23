import type { User } from "./user";

export interface UserRepository {
  create(input: { email: string }): Promise<User>;
}
