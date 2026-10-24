import { z } from "zod";
import { researchActor, researchResources } from "@/lib/research";
import {
  categories,
  ResearchError,
} from "@/modules/research-and-diligence/domain/types";
import {
  boundedBytes,
  errorResponse,
  jsonBody,
  sameOrigin,
} from "@/modules/research-and-diligence/presentation/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const scope = { companyId: z.uuid(), dealId: z.uuid().nullable() };
const evidence = z
  .object({
    kind: z.enum(["document", "note"]),
    targetId: z.uuid(),
    revisionId: z.uuid(),
    locator: z.string().max(300),
  })
  .strict();
const save = z
  .object({
    ...scope,
    id: z.uuid().optional(),
    kind: z.enum(["note", "memo"]),
    expectedRevisionId: z.uuid().nullable(),
    title: z.string().max(200),
    body: z.string().max(100000),
    sections: z.record(z.string(), z.string().max(50000)),
    label: z.enum(["Observation", "Interpretation", "Open question"]),
    evidence: z.array(evidence).max(100),
    owner: z.string().optional(),
  })
  .strict();
const upload = z
  .object({
    ...scope,
    documentId: z.uuid().optional(),
    title: z.string().max(200),
    category: z.enum(categories),
    description: z.string().max(2000),
    filename: z.string().max(255),
    size: z
      .number()
      .int()
      .min(1)
      .max(25 * 1024 * 1024),
  })
  .strict();
const update = z
  .object({
    kind: z.enum(["document", "note", "memo"]),
    archived: z.boolean().optional(),
    title: z.string().max(200).optional(),
    category: z.enum(categories).optional(),
    description: z.string().max(2000).optional(),
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ResearchError(
      "invalid",
      "Check the required fields, identifiers, and content length.",
    );
  return result.data;
}
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  try {
    if (request.method !== "GET") sameOrigin(request);
    const actor = await researchActor();
    const { service } = researchResources();
    const { path } = await context.params;
    const [resource, id, operation] = path;
    const validId = id ? z.uuid().safeParse(id).success : false;
    let result: unknown;
    if (
      request.method === "POST" &&
      path.length === 1 &&
      resource === "records"
    )
      result = await service.save(actor, parse(save, await jsonBody(request)));
    else if (
      request.method === "POST" &&
      path.length === 1 &&
      resource === "uploads"
    )
      result = await service.reserve(
        actor,
        parse(upload, await jsonBody(request)),
      );
    else if (
      request.method === "PUT" &&
      path.length === 2 &&
      resource === "uploads" &&
      validId
    ) {
      // Authorize the target before accepting a potentially large request body.
      const workspace = await service.workspace(actor);
      if (actor.role === "viewer")
        throw new ResearchError("forbidden", "Contributor access is required.");
      if (!workspace.documents.some((d) => d.versions.some((v) => v.id === id)))
        throw new ResearchError("missing", "Document version not found.");
      result = await service.upload(
        actor,
        id,
        await boundedBytes(request, 25 * 1024 * 1024),
      );
    } else if (
      request.method === "POST" &&
      path.length === 3 &&
      resource === "uploads" &&
      operation === "retry" &&
      validId
    )
      result = await service.upload(actor, id);
    else if (
      request.method === "PATCH" &&
      path.length === 2 &&
      resource === "items" &&
      validId
    )
      result = await service.update(
        actor,
        id,
        parse(update, await jsonBody(request)),
      );
    else if (
      request.method === "POST" &&
      path.length === 1 &&
      resource === "reconcile"
    )
      result = await service.reconcile(actor);
    else if (
      request.method === "GET" &&
      path.length === 2 &&
      resource === "files" &&
      validId
    ) {
      const file = await service.download(actor, id);
      return new Response(Buffer.from(file.bytes), {
        headers: {
          "Content-Type": file.mediaType,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox; default-src 'none'",
        },
      });
    } else throw new ResearchError("missing", "Research endpoint not found.");
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
