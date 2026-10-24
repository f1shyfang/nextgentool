import http from "node:http";
import readline from "node:readline";

// Standalone localhost fault injector; never imported by the application.
let fault = "none";
const heldResponses = [];
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (
    [
      "none",
      "drop-create",
      "drop-transition",
      "reject-patch",
      "hold-company-search",
      "hold-duplicates",
      "release",
    ].includes(line.trim())
  ) {
    if (line.trim() === "release") {
      for (const send of heldResponses.splice(0)) send();
      console.log("Released held responses.");
      return;
    }
    fault = line.trim();
    console.log(`Armed: ${fault}`);
  }
});
const server = http.createServer((request, response) => {
  const pathname = new URL(
    request.url,
    "http://localhost:3101",
  ).pathname.replace(/\/$/, "");
  const mode = fault;
  const hold =
    request.method === "GET" &&
    ((mode === "hold-company-search" &&
      pathname === "/api/pipeline/companies") ||
      (mode === "hold-duplicates" && pathname === "/api/pipeline/deals"));
  const matches =
    (mode === "drop-create" &&
      request.method === "POST" &&
      pathname === "/api/pipeline/deals") ||
    (mode === "drop-transition" &&
      request.method === "POST" &&
      /^\/api\/pipeline\/deals\/[^/]+\/transition$/.test(pathname)) ||
    (mode === "reject-patch" &&
      request.method === "PATCH" &&
      /^\/api\/pipeline\/deals\/[^/]+$/.test(pathname));

  if (matches && mode === "reject-patch") {
    fault = "none";
    request.resume();
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        code: "invalid",
        error: "Synthetic E2E rejection: retry after reviewing the form.",
      }),
    );
    console.log("Rejected one PATCH before persistence.");
    return;
  }
  const upstream = http.request(
    {
      hostname: "localhost",
      port: 3100,
      method: request.method,
      path: request.url,
      headers: request.headers,
    },
    (result) => {
      if (
        matches &&
        mode.startsWith("drop-") &&
        result.statusCode >= 200 &&
        result.statusCode < 300
      ) {
        result.resume();
        result.on("end", () => {
          console.log(
            `Dropped completed upstream response (${result.statusCode}) for ${mode}.`,
          );
          response.destroy();
        });
        return;
      }
      if (hold && result.statusCode >= 200 && result.statusCode < 300) {
        fault = "none";
        const chunks = [];
        result.on("data", (chunk) => chunks.push(chunk));
        result.on("end", () => {
          heldResponses.push(() => {
            response.writeHead(result.statusCode, result.headers);
            response.end(Buffer.concat(chunks));
          });
          console.log(`Held response for ${mode}; send release to deliver.`);
        });
        return;
      }
      response.writeHead(result.statusCode ?? 502, result.headers);
      result.pipe(response);
    },
  );
  upstream.on("error", () => {
    response.writeHead(502);
    response.end("Local E2E upstream unavailable");
  });
  request.pipe(upstream);
});
server.listen(3101, "localhost", () =>
  console.log(
    "Local pipeline fault proxy listening at http://localhost:3101; upstream localhost:3100.",
  ),
);
