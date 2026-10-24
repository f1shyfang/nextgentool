import {
  pipelineRequest,
  readMutation,
} from "@/modules/deal-pipeline/presentation/http";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: Context) {
  return pipelineRequest(async ({ pipeline, context }) =>
    pipeline.detail(context, (await params).id),
  );
}
export async function PATCH(request: Request, { params }: Context) {
  return pipelineRequest(async ({ pipeline, context }) => ({
    deal: await pipeline.update(
      context,
      (await params).id,
      await readMutation(request),
    ),
  }));
}
