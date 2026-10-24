import {
  pipelineRequest,
  readFilters,
  readMutation,
} from "@/modules/deal-pipeline/presentation/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return pipelineRequest(({ pipeline, context }) =>
    pipeline.list(context, readFilters(new URL(request.url).searchParams)),
  );
}
export async function POST(request: Request) {
  return pipelineRequest(
    async ({ pipeline, context }) => ({
      deal: await pipeline.create(context, await readMutation(request)),
    }),
    201,
  );
}
