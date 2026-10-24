import { pipelineRequest } from "@/modules/deal-pipeline/presentation/http";
export async function GET(request: Request) {
  return pipelineRequest(async ({ pipeline, context }) => ({
    companies: await pipeline.companies(
      context,
      new URL(request.url).searchParams.get("q") ?? "",
    ),
  }));
}
