import fs from "node:fs";
import { load } from "cheerio";

for (const name of ["reference", "team", "startups", "career"]) {
  const $ = load(fs.readFileSync(`/tmp/nextgen-${name}.html`, "utf8"));
  $("script,style").remove();
  console.log("\nPAGE", name);
  console.log($("body").text().replace(/\s+/g, " ").slice(0, 16000));
  console.log(
    "\nSTRUCTURE",
    $("[data-framer-name]")
      .map((_i, e) => $(e).attr("data-framer-name"))
      .get()
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(" | "),
  );
}
