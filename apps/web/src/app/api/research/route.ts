import { researchActor, researchResources } from "@/lib/research";
import { errorResponse } from "@/modules/research-and-diligence/presentation/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const actor = await researchActor();
    return Response.json(await researchResources().service.workspace(actor), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
