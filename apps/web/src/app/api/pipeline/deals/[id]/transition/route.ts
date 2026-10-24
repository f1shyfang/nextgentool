import {
  pipelineRequest,
  readMutation,
} from "@/modules/deal-pipeline/presentation/http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return pipelineRequest(async ({ pipeline, context }) => ({
    deal: await pipeline.transition(
      context,
      (await params).id,
      await readMutation(request),
    ),
  }));
}
