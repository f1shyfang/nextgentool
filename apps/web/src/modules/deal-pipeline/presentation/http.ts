import { auth } from "@clerk/nextjs/server";
import { createDealPipelineCompositionRoot } from "@/lib/composition-root";
import { PipelineError } from "../domain/pipeline";

export async function pipelineSession() {
  const { userId } = await auth();
  if (!userId) return null;
  const pipeline = createDealPipelineCompositionRoot();
  const context = await pipeline.repository.memberForUser(userId);
  return { pipeline: pipeline.service, context };
}

export async function pipelineRequest(
  operation: (session: {
    pipeline: ReturnType<typeof createDealPipelineCompositionRoot>["service"];
    context: NonNullable<
      Awaited<ReturnType<typeof pipelineSession>>
    >["context"] & {};
  }) => Promise<unknown>,
  status = 200,
) {
  try {
    const session = await pipelineSession();
    if (!session)
      return Response.json(
        { code: "unauthenticated", error: "Sign in to access the pipeline." },
        { status: 401 },
      );
    if (!session.context)
      return Response.json(
        {
          code: "forbidden",
          error: "Ask your firm administrator for pipeline access.",
        },
        { status: 403 },
      );
    return Response.json(
      await operation({ pipeline: session.pipeline, context: session.context }),
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof PipelineError) {
      const status = {
        invalid: 400,
        not_found: 404,
        conflict: 409,
        forbidden: 403,
      }[error.code];
      return Response.json(
        { code: error.code, error: error.message },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    console.error(
      "Deal Pipeline request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json(
      {
        code: "unavailable",
        error: "The pipeline could not be saved or loaded. Please try again.",
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function readMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    const host =
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      request.headers.get("host") ||
      new URL(request.url).host;
    let matchesHost = false;
    try {
      const originUrl = new URL(origin);
      // Next.js can report an internal URL behind a proxy; compare the public host.
      matchesHost =
        ["http:", "https:"].includes(originUrl.protocol) &&
        originUrl.host === host;
    } catch {
      matchesHost = false;
    }
    if (!matchesHost)
      throw new PipelineError(
        "forbidden",
        "Submit changes from this application.",
      );
  }
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new PipelineError(
      "forbidden",
      "Submit changes from this application.",
    );
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new PipelineError("invalid", "Send changes as JSON.");
  if (Number(request.headers.get("content-length")) > 32768)
    throw new PipelineError("invalid", "The submitted deal is too large.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new PipelineError("invalid", "A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 32768) {
        await reader.cancel();
        throw new PipelineError("invalid", "The submitted deal is too large.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    throw new PipelineError(
      "invalid",
      "The request body must contain valid JSON.",
    );
  } finally {
    reader.releaseLock();
  }
}

export function readFilters(params: URLSearchParams) {
  return Object.fromEntries(
    ["q", "owner", "stage", "scope"].flatMap((key) => {
      const value = params.get(key);
      return value ? [[key, value]] : [];
    }),
  );
}
