import { ResearchError } from "../domain/types";

export function errorResponse(error: unknown): Response {
  if (error instanceof ResearchError) {
    const status = {
      invalid: 400,
      forbidden: 403,
      missing: 404,
      conflict: 409,
      unavailable: 503,
    }[error.code];
    return Response.json(
      { error: error.message, code: error.code },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof SyntaxError)
    return Response.json(
      { error: "The request is not valid JSON.", code: "invalid" },
      { status: 400 },
    );
  console.error(
    "Research request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      error:
        "Research could not be saved or loaded. Retry, or contact your administrator.",
      code: "unavailable",
    },
    { status: 503 },
  );
}

export async function boundedBytes(request: Request, limit: number) {
  const stated = request.headers.get("content-length");
  if (stated && (!Number.isFinite(Number(stated)) || Number(stated) > limit))
    throw new ResearchError("invalid", "The request exceeds the allowed size.");
  if (!request.body)
    throw new ResearchError("invalid", "The request body is empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new ResearchError(
          "invalid",
          "The request exceeds the allowed size.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
export async function jsonBody(request: Request) {
  const body: unknown = JSON.parse(
    new TextDecoder().decode(await boundedBytes(request, 1024 * 1024)),
  );
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ResearchError("invalid", "Supply a JSON object.");
  return body;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new ResearchError(
      "forbidden",
      "Open this app directly before saving research.",
    );
}
