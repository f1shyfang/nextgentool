import assert from "node:assert/strict";
import fs from "node:fs";
import { load } from "cheerio";

const origin = process.argv[2] || "http://localhost:3000";
const routes = JSON.parse(
  fs.readFileSync(new URL("../content/routes.json", import.meta.url)),
);
const publicRoutes = new Set([
  ...routes.map((record) => record.route),
  "/sign-in",
  "/sign-up",
]);
const assets = new Set();

for (const route of publicRoutes) {
  const response = await fetch(
    new URL(route === "/" ? "/" : `${route}/`, origin),
  );
  assert.equal(response.status, 200, `Public route ${route}`);
  const $ = load(await response.text());
  assert.ok($("h1").length, `Heading missing on ${route}`);
  if (route === "/sign-in" || route === "/sign-up") {
    assert.ok($(".auth-form").length, `Auth mount missing on ${route}`);
    continue;
  }
  assert.equal(
    $(".replica-menu-toggle").length,
    1,
    `Navigation missing on ${route}`,
  );
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href.startsWith("/") && !href.startsWith("//")) {
      const target = href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
      assert.ok(
        publicRoutes.has(target) || target === "/dashboard",
        `Broken internal link ${href} on ${route}`,
      );
    }
  });
  $("img[src],script[src],link[href]").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("href");
    if (src.startsWith("/") && !src.startsWith("//")) assets.add(src);
  });
}

for (const asset of assets) {
  const response = await fetch(new URL(asset, origin));
  assert.equal(response.status, 200, `Asset missing: ${asset}`);
  await response.arrayBuffer();
}

const dashboard = await fetch(new URL("/dashboard/", origin), {
  redirect: "manual",
});
const body = await dashboard.text();
const location = dashboard.headers.get("location") || "";
// A loading boundary may stream a 200 with a Next.js redirect in its body.
assert.ok(
  location.includes("/sign-in") ||
    (body.includes("NEXT_REDIRECT") && body.includes("/sign-in")),
  "Signed-out dashboard must redirect to login",
);
assert.ok(
  !body.includes("Your home for exploring the NextGen community"),
  "Dashboard content leaked to a signed-out request",
);
assert.ok(
  !body.includes("Make your next connection."),
  "Protected dashboard content leaked",
);
console.log(
  `Verified ${publicRoutes.size} public routes, ${assets.size} local assets, and signed-out dashboard protection.`,
);
