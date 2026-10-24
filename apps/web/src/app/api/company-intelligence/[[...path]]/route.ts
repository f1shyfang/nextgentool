import { companySession } from "@/lib/company-intelligence";
import { createCompanyHttpHandler } from "@/modules/company-intelligence/presentation/http";

export const runtime = "nodejs";
const handle = createCompanyHttpHandler({
  session: companySession,
  logError: (name, requestId) =>
    console.error("Company Intelligence request failed", { name, requestId }),
});
type Context = { params: Promise<{ path?: string[] }> };
export async function GET(request: Request, context: Context) {
  return handle(request, (await context.params).path);
}
export async function POST(request: Request, context: Context) {
  return handle(request, (await context.params).path);
}
