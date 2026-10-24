import { mkdir } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

async function createCompany(page: Page, name = "TEST Aurora Ventures") {
  await page.goto("/companies/");
  await page.getByRole("button", { name: "Add company", exact: true }).click();
  await page.getByLabel("Company name", { exact: true }).fill(name);
  await page
    .getByLabel("Website (optional)")
    .fill("https://aurora.example.com");
  await page.getByRole("button", { name: "Check for matches" }).click();
  await page
    .getByRole("button", { name: "Create company", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function fillFact(page: Page, value: string) {
  await page.getByRole("button", { name: "Add fact", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Field", exact: true })
    .selectOption("description");
  await page.getByRole("textbox", { name: "Value", exact: true }).fill(value);
  await page
    .getByLabel("Source title", { exact: true })
    .fill("TEST Company announcement");
  await page
    .getByLabel("Source URL", { exact: true })
    .fill("https://source.example.com/announcement");
  await page.getByLabel("Observed at (UTC)").fill("2026-01-01T12:00");
}
async function addFact(page: Page, value: string) {
  await fillFact(page, value);
  await page.getByRole("button", { name: "Save fact", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved");
}
async function saveDecision(page: Page, reason: string) {
  await page.getByLabel("Reason", { exact: true }).fill(reason);
  await page
    .getByRole("button", { name: "Save decision", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /^(Review fact|Pin fact|Release pin):/ }),
  ).toHaveCount(0);
}

test.beforeEach(async ({ request }) => {
  await request.post("/test/reset");
});

test("creates, searches, reloads and opens persisted company profiles", async ({
  page,
}) => {
  await page.goto("/companies/");
  await expect(
    page.getByRole("heading", { name: "Companies", exact: true }),
  ).toBeVisible();
  await createCompany(page);
  const profileUrl = page.url();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "TEST Aurora Ventures", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All companies", exact: true }).click();
  await page.getByRole("searchbox").fill("Aurora");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: /TEST Aurora Ventures/ }).click();
  await expect(page).toHaveURL(profileUrl);
});

test("requires duplicate review and preserves a reason for intentional distinct companies", async ({
  page,
}) => {
  await createCompany(page);
  await page.goto("/companies/");
  await page.getByRole("button", { name: "Add company", exact: true }).click();
  await page
    .getByLabel("Company name", { exact: true })
    .fill("TEST Aurora Ventures");
  await page.getByLabel("Website (optional)").fill("aurora.example.com");
  await page.getByRole("button", { name: "Check for matches" }).click();
  await expect(
    page.getByRole("link", { name: /TEST Aurora Ventures/ }),
  ).toHaveCount(2);
  await page
    .getByRole("status")
    .getByRole("link", { name: "TEST Aurora Ventures", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "TEST Aurora Ventures", exact: true }),
  ).toBeVisible();
  await page.goto("/companies/");
  await page.getByRole("button", { name: "Add company", exact: true }).click();
  await page
    .getByLabel("Company name", { exact: true })
    .fill("TEST Aurora Ventures");
  await page.getByLabel("Website (optional)").fill("aurora.example.com");
  await page.getByRole("button", { name: "Check for matches" }).click();
  await page
    .getByRole("button", { name: "Create company", exact: true })
    .click();
  await expect(page.getByLabel("Reason for a separate company")).toBeFocused();
  await page
    .getByLabel("Reason for a separate company")
    .fill("TEST Separate legal entity with same trading name");
  await page
    .getByRole("button", { name: "Create company", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "TEST Aurora Ventures", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All companies", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /TEST Aurora Ventures/ }),
  ).toHaveCount(2);
});

test("adds evidence, reviews, pins, exposes conflicts and releases pins", async ({
  page,
}) => {
  await createCompany(page);
  await addFact(page, "TEST Infrastructure for private markets");
  await page.getByRole("button", { name: "Evidence (1)", exact: true }).click();
  await page.getByText("Description · 1 claim", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "TEST Company announcement" }),
  ).toHaveAttribute("href", "https://source.example.com/announcement");
  await page.getByRole("button", { name: "Review fact", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Review status", exact: true })
    .selectOption("verified");
  await saveDecision(page, "TEST Checked original source");
  await page.getByRole("button", { name: "Pin fact", exact: true }).click();
  await saveDecision(page, "TEST Preferred verified description");
  await addFact(page, "TEST Alternative markets description");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByText("Pinned selection", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Conflicting evidence requires review.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Evidence (2)", exact: true }).click();
  await page.getByText("Description · 2 claims", { exact: true }).click();
  await page.getByRole("button", { name: "Release pin", exact: true }).click();
  await saveDecision(page, "TEST Return to automatic source resolution");
  await expect(page.getByText(/Released pin/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Evidence (2)", exact: true }).click();
  await page.getByText("Description · 2 claims", { exact: true }).click();
  await expect(page.getByText(/Released pin/)).toBeVisible();
});

test("retains a stale draft until explicit reload and resubmission", async ({
  page,
  request,
}) => {
  await createCompany(page);
  await fillFact(page, "TEST Preserved analyst draft");
  const companyId = new URL(page.url()).pathname
    .split("/")
    .filter(Boolean)
    .at(-1);
  await request.post("/test/concurrent-save", { data: { companyId } });
  await page.getByRole("button", { name: "Save fact", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Load latest profile", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Value", exact: true }),
  ).toHaveValue("TEST Preserved analyst draft");
  await expect(
    page.getByRole("button", { name: "Save fact", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Load latest profile", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Value", exact: true }),
  ).toHaveValue("TEST Preserved analyst draft");
  await page.getByRole("button", { name: "Save fact", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Evidence (2)", exact: true }),
  ).toBeVisible();
});

test("viewer can research but cannot mutate through controls or the real HTTP handler", async ({
  page,
  request,
  context,
}) => {
  await createCompany(page);
  const profileUrl = page.url();
  await request.get("/test/viewer");
  // APIRequestContext shares this browser context's cookie jar.
  await context.addCookies([
    { name: "TEST_viewer", value: "1", domain: "127.0.0.1", path: "/" },
  ]);
  await page.goto(profileUrl);
  await expect(
    page.getByRole("heading", { name: "TEST Aurora Ventures", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add fact", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "All companies", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add company", exact: true }),
  ).toHaveCount(0);
  const response = await request.post("/api/company-intelligence/companies/", {
    headers: { Origin: "http://127.0.0.1:4327" },
    data: { requestId: crypto.randomUUID(), name: "TEST Forbidden company" },
  });
  expect(response.status()).toBe(403);
});

test("replays a committed fact after a dropped response without duplicating evidence", async ({
  page,
  request,
}) => {
  await createCompany(page);
  await fillFact(page, "TEST Single committed fact");
  let committed = false;
  await page.route(
    "**/api/company-intelligence/companies/*/assertions/",
    async (route) => {
      if (!committed) {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        committed = true;
        await route.abort("failed");
      } else await route.continue();
    },
  );
  await page.getByRole("button", { name: "Save fact", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "connection was interrupted",
  );
  await expect(
    page.getByRole("textbox", { name: "Value", exact: true }),
  ).toHaveValue("TEST Single committed fact");
  await page.getByRole("button", { name: "Save fact", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  const companyId = new URL(page.url()).pathname
    .split("/")
    .filter(Boolean)
    .at(-1);
  const response = await request.get(
    `/api/company-intelligence/companies/${companyId}/`,
  );
  expect((await response.json()).assertions).toHaveLength(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Evidence (1)", exact: true }),
  ).toBeVisible();
});

test("desktop and mobile company research layout remains readable without horizontal overflow", async ({
  page,
}) => {
  await createCompany(page);
  await addFact(
    page,
    "TEST Infrastructure supporting investment research and private market analysis",
  );
  await addFact(
    page,
    "TEST Alternative description from an independent source",
  );
  await expect(
    page.getByText("Conflicting evidence requires review.", { exact: true }),
  ).toBeVisible();
  await mkdir(".impeccable/review", { recursive: true });
  await page.screenshot({
    path: ".impeccable/review/company-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "TEST Aurora Ventures", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".impeccable/review/company-mobile.png",
    fullPage: true,
  });
});
