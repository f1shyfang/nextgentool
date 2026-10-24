import { randomUUID } from "node:crypto";
import type { createCompanyService } from "../application/service";
import type { createManualSignalsService } from "../application/signals";
import { type Actor, CompanyError } from "../domain/types";

type Session = {
  actor: Actor;
  service: ReturnType<typeof createCompanyService>;
  signalsService?: ReturnType<typeof createManualSignalsService>;
};
type Dependencies = {
  session(): Promise<Session>;
  logError(errorName: string, requestId: string): void;
};
const headers = { "Cache-Control": "private, no-store" };

async function mutationBody(request: Request): Promise<unknown> {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new CompanyError(
      "forbidden",
      "Submit changes from this application.",
    );
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new CompanyError("invalid", "Send a JSON request body.");
  if (!request.body)
    throw new CompanyError("invalid", "A JSON request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 32768) {
        await reader.cancel();
        throw new CompanyError("invalid", "The request body exceeds 32 KB.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (error) {
    if (error instanceof CompanyError) throw error;
    throw new CompanyError(
      "invalid",
      "The request body must contain valid JSON.",
    );
  } finally {
    reader.releaseLock();
  }
}

export function createCompanyHttpHandler(dependencies: Dependencies) {
  return async (request: Request, path: string[] = []): Promise<Response> => {
    const requestId = randomUUID();
    const responseHeaders = { ...headers, "X-Request-ID": requestId };
    try {
      const { actor, service, signalsService } = await dependencies.session();
      const [resource, companyId, subresource, itemId, action] = path;
      if (
        request.method === "POST" &&
        resource === "company-candidates" &&
        path.length === 1
      ) {
        return Response.json(
          await service.companyCandidates(actor, await mutationBody(request)),
          { headers: responseHeaders },
        );
      }
      if (request.method === "GET") {
        if (
          resource === "companies" &&
          path.length === 3 &&
          (subresource === "signals" || subresource === "financing")
        ) {
          if (!signalsService)
            throw new CompanyError(
              "unavailable",
              "Manual signals are temporarily unavailable.",
            );
          if (subresource === "signals")
            return Response.json(
              await signalsService.workspace(actor, companyId),
              { headers: responseHeaders },
            );
          const params = new URL(request.url).searchParams;
          const allowed = [
            "currency",
            "roundType",
            "minAmount",
            "maxAmount",
            "from",
            "to",
          ];
          for (const key of params.keys())
            if (!allowed.includes(key) || params.getAll(key).length > 1)
              throw new CompanyError(
                "invalid",
                "Unsupported or duplicate financing parameter.",
              );
          return Response.json(
            await signalsService.financingHistory(
              actor,
              companyId,
              Object.fromEntries(params),
            ),
            { headers: responseHeaders },
          );
        }
        if (resource === "companies" && path.length === 1) {
          const params = new URL(request.url).searchParams;
          for (const key of params.keys())
            if (
              !["q", "limit", "after"].includes(key) ||
              params.getAll(key).length > 1
            )
              throw new CompanyError(
                "invalid",
                "Unsupported or duplicate search parameter.",
              );
          const result = await service.listCompanies(actor, {
            q: params.get("q") ?? "",
            limit: params.has("limit") ? Number(params.get("limit")) : 25,
            after: params.get("after"),
          });
          return Response.json(result, { headers: responseHeaders });
        }
        if (resource === "companies" && path.length === 2)
          return Response.json(await service.profile(actor, companyId), {
            headers: responseHeaders,
          });
      }
      if (request.method === "POST" && resource === "companies") {
        const body = await mutationBody(request);
        if (
          subresource === "signals" &&
          (path.length === 3 || (path.length === 5 && action === "corrections"))
        ) {
          if (!signalsService)
            throw new CompanyError(
              "unavailable",
              "Manual signals are temporarily unavailable.",
            );
          const result =
            path.length === 3
              ? await signalsService.createSignal(actor, companyId, body)
              : await signalsService.correctSignal(
                  actor,
                  companyId,
                  itemId,
                  body,
                );
          return Response.json(result, {
            status: path.length === 3 ? 201 : 200,
            headers: responseHeaders,
          });
        }
        if (path.length === 1)
          return Response.json(await service.createCompany(actor, body), {
            status: 201,
            headers: responseHeaders,
          });
        if (subresource === "assertions" && path.length === 3)
          return Response.json(
            await service.addAssertion(actor, companyId, body),
            { status: 201, headers: responseHeaders },
          );
        if (
          subresource === "assertions" &&
          path.length === 5 &&
          action === "reviews"
        )
          return Response.json(
            await service.reviewAssertion(actor, companyId, itemId, body),
            { headers: responseHeaders },
          );
        if (subresource === "overrides" && path.length === 3)
          return Response.json(
            await service.setOverride(actor, companyId, body),
            { status: 201, headers: responseHeaders },
          );
        if (
          subresource === "overrides" &&
          path.length === 5 &&
          action === "release"
        )
          return Response.json(
            await service.releaseOverride(actor, companyId, itemId, body),
            { headers: responseHeaders },
          );
      }
      return Response.json(
        { code: "not_found", error: "Company research endpoint not found." },
        { status: 404, headers: responseHeaders },
      );
    } catch (error) {
      if (error instanceof CompanyError) {
        const status = {
          invalid: 400,
          forbidden: 403,
          not_found: 404,
          conflict: 409,
          unauthenticated: 401,
          unavailable: 503,
        }[error.code];
        return Response.json(
          { code: error.code, error: error.message },
          { status, headers: responseHeaders },
        );
      }
      dependencies.logError(
        error instanceof Error ? error.name : "UnknownError",
        requestId,
      );
      return Response.json(
        {
          code: "unavailable",
          error: "Company research is temporarily unavailable. Try again.",
        },
        { status: 503, headers: responseHeaders },
      );
    }
  };
}
