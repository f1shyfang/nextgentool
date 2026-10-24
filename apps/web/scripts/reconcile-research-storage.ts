import { env } from "@repo/env/server";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { reconcileStorage } from "../src/modules/research-and-diligence/application/reconcile-storage";
import { createPrivateStorage } from "../src/modules/research-and-diligence/infrastructure/files";
import { researchFirms } from "../src/modules/research-and-diligence/infrastructure/schema";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply"))
  throw new Error("Usage: research:reconcile-storage [--apply]");
const client = postgres(env.DATABASE_URL);
try {
  const firms = await drizzle(client)
    .select({ state: researchFirms.state })
    .from(researchFirms);
  const apply = args.includes("--apply");
  const ids = await reconcileStorage(
    createPrivateStorage(env.RESEARCH_STORAGE_PATH),
    firms.map((firm) => firm.state),
    Date.now(),
    apply,
  );
  console.log(
    `${ids.length} old unreferenced objects ${apply ? "removed" : "eligible; use --apply to remove"}. Retained document versions are never removed.`,
  );
} finally {
  await client.end();
}
