/**
 * Mechanical migration of the supplied public reference into local static
 * content. Framer's layout CSS is preserved; its runtime, tracking scripts,
 * editor hooks, and remote image/font dependencies are removed.
 * Generated files are content snapshots, not application logic.
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";

const root = process.cwd();
const origin = "https://www.nextgenventures.com.au";
const contentDir = path.join(root, "content");
const publicDir = path.join(root, "public");
await fs.mkdir(contentDir, { recursive: true });
await fs.mkdir(path.join(publicDir, "assets"), { recursive: true });
await fs.mkdir(path.join(publicDir, "styles"), { recursive: true });

const pages = new Map([
  ["/", await fs.readFile("/tmp/nextgen-reference.html", "utf8")],
  ["/our-team", await fs.readFile("/tmp/nextgen-team.html", "utf8")],
  ["/startups", await fs.readFile("/tmp/nextgen-startups.html", "utf8")],
  ["/career", await fs.readFile("/tmp/nextgen-career.html", "utf8")],
]);
const portfolio = load(pages.get("/startups"));
const detailRoutes = [
  ...new Set(
    portfolio("a")
      .map((_, el) => portfolio(el).attr("href"))
      .get(),
  ),
]
  .filter((href) => href.startsWith("./startups/"))
  .map((href) => href.slice(1));
detailRoutes.push("/career/investments-associate");
for (let i = 0; i < detailRoutes.length; i += 4) {
  await Promise.all(
    detailRoutes.slice(i, i + 4).map(async (route) => {
      const response = await fetch(origin + route);
      if (!response.ok) throw new Error(`${route}: ${response.status}`);
      pages.set(route, await response.text());
    }),
  );
}

const assets = new Map();
function localAsset(remote) {
  if (!remote.startsWith("https://")) return remote;
  const url = new URL(remote.replaceAll("&amp;", "&"));
  if (!["framerusercontent.com", "fonts.gstatic.com"].includes(url.hostname))
    return remote;
  const extension = path.extname(url.pathname) || ".bin";
  // One deterministic local rendition per source; sufficient for high-DPI cards.
  const key = url.origin + url.pathname;
  const local = `/assets/${createHash("sha256").update(key).digest("hex").slice(0, 16)}${extension}`;
  if (!assets.has(key)) {
    if (/\.(png|jpe?g|webp|avif)$/i.test(extension))
      url.searchParams.set("scale-down-to", "2048");
    assets.set(key, { source: url.href, local });
  }
  return local;
}

const records = [];
for (const [route, raw] of pages) {
  const $ = load(raw);
  // The careers page is client-rendered on the reference. Capture only its
  // rendered content; use the original full responsive stylesheet from <head>.
  if (route === "/career")
    $("#main").replaceWith(
      await fs.readFile("/tmp/nextgen-career-main.html", "utf8"),
    );
  const key = route === "/" ? "home" : route.slice(1).replaceAll("/", "--");
  const fontCss = $("style[data-framer-font-css]").text();
  const latinFonts = (fontCss.match(/@font-face\s*\{[^}]*\}/g) || [])
    .filter(
      (rule) => !rule.includes("unicode-range") || rule.includes("U+0000-00FF"),
    )
    .join("\n");
  let css =
    latinFonts +
    "\n" +
    $("style")
      .not("[data-framer-font-css]")
      .map((_, el) => $(el).text())
      .get()
      .join("\n");
  css = css.replace(
    /https:\/\/[^\s)"']+\.(?:woff2?|png|jpe?g|webp|svg)(?:\?[^\s)"']*)?/g,
    localAsset,
  );

  const main = $("#main");
  main.find("script,style,link").remove();
  // Collapse Framer's animation-only character wrappers back to ordinary text.
  main.find("span").each((_, el) => {
    const span = $(el);
    if (!span.attr("class") && /opacity:0\.001/.test(span.attr("style") || ""))
      span.replaceWith(span.html());
  });
  main.find("*").each((_, el) => {
    const item = $(el);
    let style = item.attr("style");
    if (
      style &&
      (item.attr("data-framer-appear-id") ||
        /opacity:\s*0(?:\.001)?(?:;|$)/.test(style))
    ) {
      style = style.replace(/(?:^|;)\s*(?:opacity|transform)\s*:[^;]*/g, "");
      item.attr("style", style);
    }
    for (const attr of Object.keys(el.attribs || {})) {
      if (
        attr.startsWith("on") ||
        attr === "data-framer-appear-id" ||
        attr === "data-framer-appear-id-optimized"
      )
        item.removeAttr(attr);
    }
  });

  const navigation = main.find("nav").first();
  if (navigation.length) {
    const headerSlot = navigation.closest(".ssr-variant").length
      ? navigation.closest(".ssr-variant").parent()
      : navigation.parent();
    const logoStyle =
      navigation
        .find('[data-framer-name="Next Gen Logo"]')
        .first()
        .attr("style") || "";
    const svgMatch = logoStyle.match(
      /url\('data:image\/svg\+xml,([\s\S]*?)'\)/,
    );
    if (svgMatch)
      await fs.writeFile(
        path.join(publicDir, "assets", "nextgen-logo.svg"),
        decodeURIComponent(svgMatch[1]),
      );
    headerSlot.attr("data-replica-header", "true").empty();
  }

  // Native CSS marquees replace the remote animation engine.
  main.find("ul").each((index, el) => {
    const list = $(el);
    if (
      list.find(
        '[data-framer-name="Landing Hero Images"], [data-framer-name="Landing Hero Images Bottom"]',
      ).length ||
      ((list.attr("style") || "").includes("flex-direction:row") &&
        list.text().trim())
    ) {
      list.addClass("replica-marquee");
      list.children("li").first().removeAttr("aria-hidden");
      if (list.find('[data-framer-name="Landing Hero Images Bottom"]').length)
        list.addClass("replica-marquee-reverse");
      list.attr("data-marquee", String(index));
    }
  });
  main
    .children("div")
    .first()
    .children()
    .filter(
      (_, el) => !$(el).is("[data-replica-header]") && $(el).text().trim(),
    )
    .first()
    .attr("id", "replica-content")
    .attr("role", "main")
    .attr("tabindex", "-1");
  main.find("a").each((_, el) => {
    const anchor = $(el);
    let href = anchor.attr("href") || "";
    if (href.startsWith("./")) href = `/${href.slice(2)}`;
    if (href.startsWith("../")) href = new URL(href, origin + route).pathname;
    if (href.startsWith(origin)) href = href.slice(origin.length) || "/";
    if (href === "/usefluency.com") href = "https://usefluency.com";
    anchor.attr("href", href);
    if (href === "https://1") anchor.removeAttr("href").removeAttr("target");
    if (href.startsWith("https://")) anchor.attr("rel", "noopener noreferrer");
    if (!anchor.text().trim() && !anchor.attr("aria-label"))
      anchor.attr(
        "aria-label",
        href === "/" ? "NextGen Ventures home" : "Open profile",
      );
  });
  main.find("img").each((index, el) => {
    const image = $(el);
    image.attr("src", localAsset(image.attr("src") || ""));
    image.removeAttr("srcset").removeAttr("sizes");
    image.attr("loading", index < 6 && route === "/" ? "eager" : "lazy");
  });

  // The page-level CSS includes the source's breakpoint visibility rules.
  let html = main.html() || "";
  const svgDefs = $("#svg-templates").toString();
  html += svgDefs;
  html = html.replace(
    /https:\/\/framerusercontent\.com\/[^\s)"']+\.(?:png|jpe?g|webp|svg)(?:\?[^\s)"']*)?/g,
    localAsset,
  );
  html = html.replace(/<!--(?:\$|\/\$|\$!--)[\s\S]*?-->/g, "");
  await fs.writeFile(path.join(contentDir, `${key}.html`), html);
  await fs.writeFile(
    path.join(publicDir, "styles", `${key}.css`),
    `${css.trimEnd()}\n`,
  );
  records.push({
    route,
    key,
    title: $("title").text(),
    source: origin + route,
  });
  console.log(`Migrated ${route}`);
}

const jobs = [...assets.values()];
for (let i = 0; i < jobs.length; i += 6) {
  await Promise.all(
    jobs.slice(i, i + 6).map(async (asset) => {
      try {
        await fs.access(path.join(publicDir, asset.local));
        return;
      } catch {}
      const response = await fetch(asset.source);
      if (!response.ok)
        throw new Error(`Asset ${asset.source}: ${response.status}`);
      await fs.writeFile(
        path.join(publicDir, asset.local),
        Buffer.from(await response.arrayBuffer()),
      );
    }),
  );
  console.log(`Assets ${Math.min(i + 6, jobs.length)}/${jobs.length}`);
}
await fs.writeFile(
  path.join(contentDir, "routes.json"),
  `${JSON.stringify(records, null, 2)}\n`,
);
await fs.writeFile(
  path.join(publicDir, "assets", "provenance.json"),
  `${JSON.stringify(
    {
      reference: origin,
      captured: "2026-10-24",
      note: "Original public reference assets retained at the user’s request for faithful replication.",
      assets: jobs,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `Imported ${records.length} routes and ${jobs.length} local assets.`,
);
