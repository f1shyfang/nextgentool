import { env } from "@repo/env/server";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(env.DATABASE_URL);

export const database = drizzle(client, { schema });
